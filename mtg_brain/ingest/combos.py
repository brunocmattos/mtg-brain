"""Ingestão de combos do Commander Spellbook (endpoint /variants/, paginado)."""
import time

import requests

from psycopg.types.json import Jsonb

from .. import config, db, http

COMBO_UPSERT = """
INSERT INTO combos (id, card_names, color_identity, prerequisites, steps, results, data)
VALUES (%(id)s, %(card_names)s, %(color_identity)s, %(prerequisites)s, %(steps)s,
        %(results)s, %(data)s)
ON CONFLICT (id) DO UPDATE SET
    card_names=EXCLUDED.card_names, color_identity=EXCLUDED.color_identity,
    prerequisites=EXCLUDED.prerequisites, steps=EXCLUDED.steps,
    results=EXCLUDED.results, data=EXCLUDED.data;
"""


def _textify(requires):
    """`requires` costuma ser uma lista de objetos (templates/pré-requisitos)."""
    if not requires:
        return None
    if isinstance(requires, str):
        return requires
    parts = []
    for r in requires:
        if isinstance(r, dict):
            parts.append(r.get("template", {}).get("name") or r.get("name") or str(r))
        else:
            parts.append(str(r))
    return "; ".join(p for p in parts if p) or None


def _row(v):
    uses = v.get("uses") or []
    card_names = [u.get("card", {}).get("name") for u in uses if u.get("card")]
    produces = v.get("produces") or []
    results = [p.get("feature", {}).get("name") for p in produces if p.get("feature")]
    return {
        "id": str(v.get("id")),
        "card_names": [c for c in card_names if c],
        "color_identity": v.get("identity"),
        "prerequisites": _textify(v.get("requires")),
        "steps": v.get("description"),
        "results": [r for r in results if r],
        "data": Jsonb(v),
    }


# Espera escalonada (segundos) ao tomar 429 — paciência pra atravessar a janela de throttle.
_RETRY_WAITS = [0, 30, 60, 120, 300, 300, 600]


def _get(url):
    """Busca uma página com paciência: trata 429/5xx E quedas de conexão (RemoteDisconnected)."""
    last = None
    for wait in _RETRY_WAITS:
        if wait:
            print(f"    [retry] esperando {wait}s e retomando...", end="\r")
            time.sleep(wait)
        try:
            resp = http.session().get(url, timeout=60)
        except requests.exceptions.RequestException as e:
            last = e  # erro de rede/conexão: espera e tenta de novo
            continue
        last = resp
        if resp.status_code == 429 or resp.status_code >= 500:
            retry_after = resp.headers.get("Retry-After", "")
            if retry_after.isdigit():
                time.sleep(int(retry_after))
            continue
        resp.raise_for_status()
        return resp.json()
    if isinstance(last, Exception):
        raise last
    last.raise_for_status()


def _combo_count():
    with db.connect() as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM combos")
        return cur.fetchone()[0]


def ingest_combos(max_pages=None, page_delay=0.34, start_offset=None):
    # Retoma de onde paramos: não re-busca (nem re-estoura o rate limit com) o que já temos.
    if start_offset is None:
        start_offset = (_combo_count() // 100) * 100
    url = config.CSB_API.rstrip("/") + f"/variants/?limit=100&offset={start_offset}"
    seen, pages = start_offset, 0
    with db.connect() as conn:
        while url:
            data = _get(url)
            rows = [_row(v) for v in data.get("results", [])]
            if rows:
                db.upsert_batch(conn, COMBO_UPSERT, rows)
                seen += len(rows)
            print(f"    ...~{seen} combos", end="\r")
            url = data.get("next")
            pages += 1
            if max_pages and pages >= max_pages:
                break
            if url and page_delay:
                time.sleep(page_delay)
    print()
    return _combo_count()
