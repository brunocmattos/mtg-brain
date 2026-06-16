"""Consultas determinísticas (SQL parametrizado, SEM LLM) que a API expõe.

Rápidas e previsíveis — o LLM (brain.ask) fica só para o chat livre e para redigir
resumos. Cartas dupla-face têm image_uris NULL no topo, então a imagem cai para o
primeiro face em data->'card_faces'.
"""
import datetime
from decimal import Decimal

from . import db


def _img(size):
    # size é literal controlado (normal/small/large) — sem injeção.
    return (f"COALESCE(image_uris->>'{size}', "
            f"data->'card_faces'->0->'image_uris'->>'{size}')")


def _card_cols():
    return f"""id, name, mana_cost, cmc, type_line, color_identity, rarity,
        set_code, edhrec_rank, (prices->>'usd')::numeric AS usd,
        {_img('normal')} AS image, {_img('small')} AS image_small,
        (legalities->>'commander') AS commander_legal"""


def _jsonable(row):
    out = {}
    for k, v in row.items():
        if isinstance(v, (datetime.date, datetime.datetime)):
            out[k] = v.isoformat()
        elif isinstance(v, Decimal):
            out[k] = float(v)
        else:
            out[k] = v
    return out


def _rows(sql, params=None):
    with db.connect() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or {})
            cols = [d.name for d in cur.description]
            data = [dict(zip(cols, r)) for r in cur.fetchall()]
        conn.rollback()
    return [_jsonable(r) for r in data]


def search_cards(q=None, colors=None, limit=40):
    where, params = [], {"limit": min(int(limit or 40), 100)}
    if q:
        where.append("(name ILIKE %(q)s OR oracle_text ILIKE %(q)s)")
        params["q"] = f"%{q}%"
    if colors:
        where.append("color_identity <@ %(colors)s")
        params["colors"] = list(colors)
    clause = " AND ".join(where) if where else "TRUE"
    sql = (f"SELECT {_card_cols()} FROM cards WHERE {clause} "
           "ORDER BY edhrec_rank NULLS LAST, name LIMIT %(limit)s")
    return _rows(sql, params)


def get_card(card_id):
    sql = f"""SELECT id, name, mana_cost, cmc, type_line, oracle_text, color_identity,
        colors, keywords, power, toughness, loyalty, rarity, set_code, released_at,
        edhrec_rank, oracle_id, (prices->>'usd')::numeric AS usd,
        (prices->>'usd_foil')::numeric AS usd_foil,
        {_img('large')} AS image_large, {_img('normal')} AS image,
        legalities, data->'card_faces' AS card_faces
        FROM cards WHERE id = %(id)s"""
    rows = _rows(sql, {"id": card_id})
    if not rows:
        return None
    card = rows[0]
    card["rulings"] = [
        r["comment"] for r in _rows(
            "SELECT comment FROM rulings WHERE oracle_id = %(oid)s ORDER BY published_at",
            {"oid": card["oracle_id"]})
    ]
    return card


def list_commanders(q=None, colors=None, max_price=None, sort="edhrec", limit=40):
    where, params = [], {"limit": min(int(limit or 40), 100)}
    if q:
        where.append("(name ILIKE %(q)s OR type_line ILIKE %(q)s OR oracle_text ILIKE %(q)s)")
        params["q"] = f"%{q}%"
    if colors:
        where.append("color_identity <@ %(colors)s")
        params["colors"] = list(colors)
    if max_price is not None:
        where.append("(prices->>'usd')::numeric <= %(maxp)s")
        params["maxp"] = float(max_price)
    clause = " AND ".join(where) if where else "TRUE"
    order = "name" if sort == "name" else "edhrec_rank NULLS LAST, name"
    sql = (f"SELECT {_card_cols()} FROM commanders WHERE {clause} "
           f"ORDER BY {order} LIMIT %(limit)s")
    return _rows(sql, params)


def recommend_commanders(theme, colors=None, max_price=None, limit=12):
    where = ["(name ILIKE %(t)s OR type_line ILIKE %(t)s OR oracle_text ILIKE %(t)s)"]
    params = {"t": f"%{theme}%", "limit": min(int(limit or 12), 50)}
    if colors:
        where.append("color_identity <@ %(colors)s")
        params["colors"] = list(colors)
    if max_price is not None:
        where.append("(prices->>'usd')::numeric <= %(maxp)s")
        params["maxp"] = float(max_price)
    sql = (f"SELECT {_card_cols()} FROM commanders WHERE {' AND '.join(where)} "
           "ORDER BY edhrec_rank NULLS LAST LIMIT %(limit)s")
    return _rows(sql, params)


def combos_for_card(name, limit=20):
    sql = ("SELECT id, card_names, color_identity, results, steps, prerequisites "
           "FROM combos WHERE %(name)s = ANY(card_names) LIMIT %(limit)s")
    return _rows(sql, {"name": name, "limit": min(int(limit or 20), 100)})


def combos_for_identity(identity, limit=20):
    chars = "".join(sorted({c for c in (identity or "").upper() if c in "WUBRG"}))
    regex = f"^[{chars}]+$" if chars else "^$"
    sql = ("SELECT id, card_names, color_identity, results "
           "FROM combos WHERE color_identity ~ %(re)s LIMIT %(limit)s")
    return _rows(sql, {"re": regex, "limit": min(int(limit or 20), 100)})


def deck_price(card_names):
    """Soma o preço USD de uma lista de nomes de carta (uma impressão por nome)."""
    sql = """
        WITH wanted AS (SELECT unnest(%(names)s::text[]) AS name),
        priced AS (
            SELECT DISTINCT ON (w.name) w.name, (c.prices->>'usd')::numeric AS usd
            FROM wanted w
            LEFT JOIN cards c ON c.name = w.name
            ORDER BY w.name, usd ASC NULLS LAST
        )
        SELECT
            COALESCE(SUM(usd), 0) AS total_usd,
            COUNT(*) FILTER (WHERE usd IS NOT NULL) AS com_preco,
            ARRAY_AGG(name) FILTER (WHERE usd IS NULL) AS sem_preco
        FROM priced
    """
    return _rows(sql, {"names": list(card_names)})[0]
