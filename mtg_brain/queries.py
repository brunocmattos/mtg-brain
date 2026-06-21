"""Consultas determinísticas (SQL parametrizado, SEM LLM) que a API expõe.

Rápidas e previsíveis. Cartas dupla-face têm image_uris NULL no topo, então a imagem
cai para o primeiro face em data->'card_faces'.
"""
import datetime
import json
import re
from decimal import Decimal

from . import config, db, http


def _img(size):
    # size é literal controlado (normal/small/large) — sem injeção.
    return (f"COALESCE(image_uris->>'{size}', "
            f"data->'card_faces'->0->'image_uris'->>'{size}')")


def _card_cols():
    return f"""id, name, mana_cost, cmc, type_line, color_identity, rarity,
        set_code, edhrec_rank, (prices->>'usd')::numeric AS usd,
        {_img('normal')} AS image, {_img('small')} AS image_small,
        (legalities->>'commander') AS commander_legal"""


# Cláusulas de ordenação permitidas (whitelist — sort vem do cliente, sem injeção).
_SORTS = {
    "edhrec": "edhrec_rank NULLS LAST, name",
    "name": "name",
    "price_asc": "(prices->>'usd')::numeric ASC NULLS LAST, name",
    "price_desc": "(prices->>'usd')::numeric DESC NULLS LAST, name",
    "cmc_asc": "cmc ASC NULLS LAST, name",
    "cmc_desc": "cmc DESC NULLS LAST, name",
}


def _order_by(sort):
    return _SORTS.get(sort or "edhrec", _SORTS["edhrec"])


def _limit(value, default=60, cap=200):
    # piso 1 (LIMIT negativo derruba o Postgres), teto `cap`.
    try:
        v = int(value)
    except (TypeError, ValueError):
        v = default
    if v <= 0:
        v = default
    return max(1, min(v, cap))


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


def search_cards(q=None, colors=None, limit=40, sort="edhrec"):
    where, params = [], {"limit": _limit(limit)}
    if q:
        where.append("(name ILIKE %(q)s OR oracle_text ILIKE %(q)s)")
        params["q"] = f"%{q}%"
    if colors:
        where.append("color_identity <@ %(colors)s")
        params["colors"] = list(colors)
    clause = " AND ".join(where) if where else "TRUE"
    sql = (f"SELECT {_card_cols()} FROM cards WHERE {clause} "
           f"ORDER BY {_order_by(sort)} LIMIT %(limit)s")
    return _rows(sql, params)


def semantic_search(q, limit=40):
    """Busca HÍBRIDA + RERANK: (1) recupera candidatos fundindo busca vetorial
    (pgvector) com full-text do Postgres via Reciprocal Rank Fusion (RRF); (2) reordena
    com um cross-encoder (lê query+carta juntos -> entende intenção composta tipo
    "punir POR comprar"). Import dos modelos é lazy (queries.py segue importável sem
    fastembed no host/testes). Mesmo formato de carta do search_cards, + 'score'."""
    if not q or not q.strip():
        return []
    from . import embed  # lazy: só carrega o modelo quando realmente busca
    lit = embed.embed_query(q)
    sql = f"""
        WITH qq AS (
            -- plainto_tsquery faz AND de tudo (estrito demais p/ linguagem natural);
            -- troco '&' por '|' => OR (casa qualquer termo; ts_rank ordena por cobertura).
            SELECT NULLIF(replace(plainto_tsquery('english', %(q)s)::text, '&', '|'), '')::tsquery AS tq
        ),
        sem AS (
            SELECT id, row_number() OVER (ORDER BY embedding <=> %(v)s::vector) AS rk
            FROM cards
            WHERE embedding IS NOT NULL AND (legalities->>'commander') = 'legal'
            ORDER BY embedding <=> %(v)s::vector
            LIMIT 150
        ),
        lex AS (
            SELECT id, row_number() OVER (
                       ORDER BY ts_rank(fts, (SELECT tq FROM qq)) DESC) AS rk
            FROM cards
            WHERE (legalities->>'commander') = 'legal'
              AND (SELECT tq FROM qq) IS NOT NULL
              AND fts @@ (SELECT tq FROM qq)
            LIMIT 150
        ),
        fused AS (  -- RRF (k=60): soma 1/(k+rank) das duas listas; 'cid' evita ambiguidade com cards.id
            SELECT id AS cid, SUM(1.0 / (60 + rk)) AS score
            FROM (SELECT id, rk FROM sem UNION ALL SELECT id, rk FROM lex) u
            GROUP BY id
        )
        SELECT {_card_cols()}, cards.oracle_text, round(f.score::numeric, 5) AS score
        FROM cards JOIN fused f ON f.cid = cards.id
        ORDER BY f.score DESC
        LIMIT %(cand)s
    """
    # 1) recupera CANDIDATOS (mais que o limite) via híbrido; 2) reordena com o
    # cross-encoder (lê query+carta juntos -> entende intenção composta).
    cand = max(_limit(limit), 100)
    rows = _rows(sql, {"v": lit, "q": q, "cand": cand})
    if not rows:
        return []
    docs = [". ".join(p for p in (r.get("name"), r.get("type_line"), r.get("oracle_text")) if p)
            for r in rows]
    try:
        scores = embed.rerank_scores(q, docs)
        for r, s in zip(rows, scores):
            r["score"] = round(float(s), 4)
        rows.sort(key=lambda r: r["score"], reverse=True)
    except Exception:
        pass  # reranker indisponível -> mantém a ordem híbrida (RRF)
    for r in rows:
        r.pop("oracle_text", None)  # campo auxiliar do rerank, fora do payload
    return rows[: _limit(limit)]


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


def _cmc_where(where, params, cmc_min, cmc_max):
    if cmc_min is not None:
        where.append("cmc >= %(cmcmin)s")
        params["cmcmin"] = float(cmc_min)
    if cmc_max is not None:
        where.append("cmc <= %(cmcmax)s")
        params["cmcmax"] = float(cmc_max)


def list_commanders(q=None, colors=None, max_price=None, sort="edhrec", limit=40,
                    cmc_min=None, cmc_max=None):
    where, params = [], {"limit": _limit(limit)}
    if q:
        where.append("(name ILIKE %(q)s OR type_line ILIKE %(q)s OR oracle_text ILIKE %(q)s)")
        params["q"] = f"%{q}%"
    if colors:
        where.append("color_identity <@ %(colors)s")
        params["colors"] = list(colors)
    if max_price is not None:
        where.append("(prices->>'usd')::numeric <= %(maxp)s")
        params["maxp"] = float(max_price)
    _cmc_where(where, params, cmc_min, cmc_max)
    clause = " AND ".join(where) if where else "TRUE"
    sql = (f"SELECT {_card_cols()} FROM commanders WHERE {clause} "
           f"ORDER BY {_order_by(sort)} LIMIT %(limit)s")
    return _rows(sql, params)


def recommend_commanders(theme, colors=None, max_price=None, limit=60, sort="edhrec",
                         cmc_min=None, cmc_max=None):
    where = ["(name ILIKE %(t)s OR type_line ILIKE %(t)s OR oracle_text ILIKE %(t)s)"]
    params = {"t": f"%{theme}%", "limit": _limit(limit)}
    if colors:
        where.append("color_identity <@ %(colors)s")
        params["colors"] = list(colors)
    if max_price is not None:
        where.append("(prices->>'usd')::numeric <= %(maxp)s")
        params["maxp"] = float(max_price)
    _cmc_where(where, params, cmc_min, cmc_max)
    sql = (f"SELECT {_card_cols()} FROM commanders WHERE {' AND '.join(where)} "
           f"ORDER BY {_order_by(sort)} LIMIT %(limit)s")
    return _rows(sql, params)


def combos_for_card(name, limit=20):
    sql = ("SELECT id, card_names, color_identity, results, steps, prerequisites "
           "FROM combos WHERE %(name)s = ANY(card_names) LIMIT %(limit)s")
    return _rows(sql, {"name": name, "limit": _limit(limit, 20, 100)})


def combos_for_identity(identity, limit=20):
    chars = "".join(sorted({c for c in (identity or "").upper() if c in "WUBRG"}))
    regex = f"^[{chars}]+$" if chars else "^$"
    sql = ("SELECT id, card_names, color_identity, results "
           "FROM combos WHERE color_identity ~ %(re)s LIMIT %(limit)s")
    return _rows(sql, {"re": regex, "limit": _limit(limit, 20, 100)})


# ============================================================ Deck Builder (Fase 3)

def _write(sql, params=None):
    """Como _rows, mas COMMITA (para INSERT/UPDATE/DELETE)."""
    with db.connect() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or {})
            rows = []
            if cur.description:
                cols = [d.name for d in cur.description]
                rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        conn.commit()
    return [_jsonable(r) for r in rows]


def create_deck(name, commander=None):
    deck = _write(
        "INSERT INTO decks (name, commander) VALUES (%(n)s, %(c)s) "
        "RETURNING id, name, commander, created_at",
        {"n": name, "c": commander},
    )[0]
    if commander:
        add_card(deck["id"], commander, 1, True)  # comandante já entra no deck
    return deck


def list_decks():
    return _rows(f"""
        SELECT d.id, d.name, d.commander, d.created_at,
               (SELECT COALESCE(SUM(dc.qty), 0) FROM deck_cards dc WHERE dc.deck_id = d.id) AS cards,
               (SELECT {_img('art_crop')} FROM cards c WHERE c.name = d.commander
                ORDER BY (c.prices->>'usd')::numeric ASC NULLS LAST LIMIT 1) AS commander_image
        FROM decks d ORDER BY d.created_at DESC
    """)


def add_card(deck_id, card_name, qty=1, is_commander=False):
    # No conflito, INCREMENTA a quantidade (não sobrescreve pra 1 — isso apagava
    # básicos com qty alto) e nunca perde o status de comandante.
    _write(
        "INSERT INTO deck_cards (deck_id, card_name, qty, is_commander) "
        "VALUES (%(d)s, %(n)s, %(q)s, %(c)s) "
        "ON CONFLICT (deck_id, card_name) DO UPDATE "
        "SET qty = deck_cards.qty + EXCLUDED.qty, "
        "    is_commander = deck_cards.is_commander OR EXCLUDED.is_commander",
        {"d": deck_id, "n": card_name, "q": qty, "c": is_commander},
    )
    return {"ok": True}


def remove_card(deck_id, card_name):
    # Remove UMA cópia (simétrico ao add +1): qty>1 decrementa, qty<=1 apaga a linha.
    # (antes apagava todas as cópias de uma vez — perda de dado em básicos com qty alto.)
    _write("""
        WITH dec AS (
            UPDATE deck_cards SET qty = qty - 1
            WHERE deck_id=%(d)s AND card_name=%(n)s AND qty > 1
        )
        DELETE FROM deck_cards WHERE deck_id=%(d)s AND card_name=%(n)s AND qty <= 1
    """, {"d": deck_id, "n": card_name})
    return {"ok": True}


def delete_deck(deck_id):
    # deck_cards cai sozinho por ON DELETE CASCADE — uma transação só.
    _write("DELETE FROM decks WHERE id=%(d)s", {"d": deck_id})
    return {"ok": True}


# ---- Versões / artes de uma carta (impressões via Scryfall, sob demanda + cache) ----

_PRINTINGS_CACHE = {}


def _scry_img(c, size):
    u = c.get("image_uris") or {}
    if u.get(size):
        return u[size]
    for face in (c.get("card_faces") or []):
        fu = face.get("image_uris") or {}
        if fu.get(size):
            return fu[size]
    return None


def card_printings(name):
    """Todas as impressões (arte/edição/preço) de uma carta — busca no Scryfall sob demanda
    (sem reingerir o bulk de impressões) e cacheia por nome durante a sessão."""
    if name in _PRINTINGS_CACHE:
        return _PRINTINGS_CACHE[name]
    out = []
    try:
        resp = http.session().get(
            f"{config.SCRYFALL_API}/cards/search",
            params={"q": f'!"{name}"', "unique": "prints", "order": "released", "dir": "desc"},
            timeout=10,
        )
        if resp.status_code == 200:
            for c in resp.json().get("data", [])[:80]:
                pr = c.get("prices") or {}
                out.append({
                    "scryfall_id": c.get("id"),
                    "set": c.get("set"),
                    "set_name": c.get("set_name"),
                    "collector_number": c.get("collector_number"),
                    "image": _scry_img(c, "normal"),
                    "art_crop": _scry_img(c, "art_crop"),
                    "usd": pr.get("usd"),
                    "eur": pr.get("eur"),
                    "tix": pr.get("tix"),
                })
    except Exception:  # noqa: BLE001 — falha de rede: devolve vazio, a UI lida
        return []
    _PRINTINGS_CACHE[name] = out
    return out


def set_printing(deck_id, card_name, printing):
    """Fixa (ou limpa, com printing=None) a impressão escolhida de uma carta no deck."""
    val = json.dumps(printing) if printing else None
    _write("UPDATE deck_cards SET printing = %(p)s::jsonb WHERE deck_id=%(d)s AND card_name=%(n)s",
           {"p": val, "d": deck_id, "n": card_name})
    return {"ok": True}


# ---- Importador de decklist (colar texto do Moxfield/Archidekt/etc.) ----

_CARD_LINE = re.compile(r"^\s*(\d+)\s*[xX]?\s+(.+?)\s*$")
_SECTION_SKIP = ("sideboard", "maybeboard", "maybe", "considering", "tokens", "token", "outside")


def _clean_card_name(name):
    # ORDEM IMPORTA: tira foil/#num PRIMEIRO; só então " (SET) 123" (ancorado no fim),
    # senão o "*F*" no fim impede o strip do set e a carta vira 'missing'.
    name = re.sub(r"\s*\*[A-Za-z]\*\s*$", "", name)      # marcador de foil/etched "*F*"
    name = re.sub(r"\s+#\d+\s*$", "", name)              # "#123" do fim
    name = re.sub(r"\s*\([^)]*\)\s*\S*\s*$", "", name)   # " (SET) 123" do fim
    return name.strip()


def _parse_decklist(text):
    """Lê uma decklist em texto (Moxfield/Archidekt/MTGGoldfish/etc.) -> [{qty,name,is_commander}].

    Entende linhas "1 Card", "1x Card", "1 Card (SET) 123 *F*" e cabeçalhos de seção
    (usa "Commander" pra marcar o comandante; ignora sideboard/maybeboard)."""
    items, section = [], "main"
    for raw in (text or "").splitlines():
        line = raw.strip()
        if not line or line.startswith("//") or line.startswith("#"):
            continue
        m = _CARD_LINE.match(line)
        if not m:  # cabeçalho de seção
            low = line.lower()
            if any(s in low for s in _SECTION_SKIP):
                section = "skip"
            elif re.match(r"^commanders?\b\s*\(?\s*\d*\s*\)?$", low):
                section = "commander"  # estrito: "Commander" / "Commanders (1)" — NÃO "Commander Staples"
            else:
                section = "main"
            continue
        if section == "skip":
            continue
        name = _clean_card_name(m.group(2))
        if name:
            items.append({"qty": int(m.group(1)), "name": name,
                          "is_commander": section == "commander"})
    return items


_EXACT = "SELECT name FROM cards WHERE name = %(n)s ORDER BY (layout='token') LIMIT 1"
_CI = ("SELECT name FROM cards WHERE lower(name) = lower(%(n)s) "
       "ORDER BY (layout='token'), edhrec_rank NULLS LAST LIMIT 1")


def _resolve_card_name(name):
    """Casa o nome lido com o nome canônico no banco. Prefere impressão real
    (layout<>'token') e NÃO usa o nome do usuário como padrão LIKE (curingas '_'/'%').
    Trata dupla-face: Moxfield exporta "A / B" (barra simples), o banco usa "A // B"."""
    def first(sql, val):
        r = _rows(sql, {"n": val})
        return r[0]["name"] if r else None

    hit = first(_EXACT, name) or first(_CI, name)
    if hit:
        return hit
    # "A / B" (Moxfield) -> "A // B" (banco)
    if " / " in name and " // " not in name:
        dfc = name.replace(" / ", " // ")
        hit = first(_EXACT, dfc) or first(_CI, dfc)
        if hit:
            return hit
    # só o front -> casa "front // back" (escapa curingas)
    front = name.split(" // ")[0].split(" / ")[0].strip()
    esc = front.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return first("SELECT name FROM cards WHERE name ILIKE %(n)s ESCAPE '\\' "
                 "ORDER BY (layout='token'), edhrec_rank NULLS LAST LIMIT 1", esc + " // %")


def import_deck(deck_name, text, commander=None):
    """Cria um deck a partir de uma decklist colada. Resolve nomes contra o banco e
    devolve o que entrou e o que não foi encontrado."""
    items = _parse_decklist(text)
    if not items:
        return {"error": "Não consegui ler nenhuma carta da lista. Cole no formato '1 Nome da Carta'."}

    # ACUMULA qty por nome (linhas repetidas somam, não descartam) preservando a ordem.
    missing, cmd_name = [], None
    agg, order = {}, []
    for it in items:
        canon = _resolve_card_name(it["name"])
        if not canon:
            missing.append(it["name"])
            continue
        if canon not in agg:
            agg[canon] = {"name": canon, "qty": 0, "is_commander": False}
            order.append(canon)
        agg[canon]["qty"] += it["qty"]
        if it["is_commander"]:
            agg[canon]["is_commander"] = True
            if not cmd_name:
                cmd_name = canon
    resolved = [agg[c] for c in order]

    if not cmd_name and commander:  # comandante explícito (quando o export não marca)
        cmd_name = _resolve_card_name(commander) or commander

    deck = create_deck(deck_name or "Deck importado", cmd_name)  # comandante já entra (qty 1)
    for r in resolved:
        if cmd_name and r["name"] == cmd_name:
            continue
        add_card(deck["id"], r["name"], r["qty"], False)

    total = sum(r["qty"] for r in resolved) + (1 if cmd_name and cmd_name not in agg else 0)
    return {
        "deck_id": deck["id"],
        "deck_name": deck["name"],
        "commander": cmd_name,
        "added": len(resolved),
        "total_cards": total,
        "total_parsed": len(items),
        "missing": missing,
        "over_limit": total > 100,  # Commander = 100; avisa sem truncar a lista colada
    }


def _deck_cards(deck_id):
    # Uma impressão (a mais barata) por nome, via LATERAL — máx ~100 lookups.
    return _rows(f"""
        SELECT dc.card_name AS name, dc.qty, dc.is_commander, c.id::text AS id,
               c.type_line, c.cmc, c.mana_cost, c.color_identity, c.oracle_text,
               c.produced_mana,
               COALESCE((dc.printing->>'usd')::numeric, p.usd) AS usd,
               COALESCE((dc.printing->>'eur')::numeric, p.eur) AS eur,
               COALESCE((dc.printing->>'tix')::numeric, p.tix) AS tix,
               p.usd AS usd_base, p.eur AS eur_base, p.tix AS tix_base,
               mp.usd AS manapool,
               COALESCE(dc.printing->>'image', c.image) AS image,
               COALESCE(dc.printing->>'art_crop', c.art_crop) AS art_crop,
               dc.printing
        FROM deck_cards dc
        LEFT JOIN LATERAL (
            SELECT id, type_line, cmc, mana_cost, color_identity, oracle_text,
                   data->'produced_mana' AS produced_mana,
                   {_img('normal')} AS image, {_img('art_crop')} AS art_crop
            FROM cards WHERE name = dc.card_name
            ORDER BY (prices->>'usd')::numeric ASC NULLS LAST LIMIT 1
        ) c ON true
        LEFT JOIN LATERAL (
            -- preço mais barato DISPONÍVEL em cada moeda (independente), senão eur/tix
            -- ficavam nulos quando a impressão mais barata em USD não tinha aquela moeda
            SELECT MIN((prices->>'usd')::numeric) AS usd,
                   MIN((prices->>'eur')::numeric) AS eur,
                   MIN((prices->>'tix')::numeric) AS tix
            FROM cards WHERE name = dc.card_name
        ) p ON true
        LEFT JOIN manapool_prices mp ON mp.name = dc.card_name
        WHERE dc.deck_id = %(id)s
        ORDER BY c.cmc NULLS FIRST, dc.card_name
    """, {"id": deck_id})


def get_deck(deck_id):
    head = _rows("SELECT id, name, commander, created_at FROM decks WHERE id=%(id)s",
                 {"id": deck_id})
    if not head:
        return None
    deck = head[0]
    cards = _deck_cards(deck_id)
    for c in cards:
        c.pop("oracle_text", None)  # texto completo não precisa ir na lista
        c.pop("produced_mana", None)  # só serve pra análise de manabase
    deck["cards"] = cards
    return deck


def _bucket(type_line):
    t = (type_line or "").lower()
    for key in ("land", "creature", "planeswalker", "instant", "sorcery",
                "artifact", "enchantment", "battle"):
        if key in t:
            return key
    return "outro"


# Terrenos básicos são "grátis" (assume-se que você os tem) — não entram no preço.
# A tabela é oracle-cards (1 impressão por nome), e a do Swamp vem marcada ~US$2,
# então contar básicos inflaria o preço de forma irreal.
BASIC_LAND_NAMES = {
    "Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes",
    "Snow-Covered Plains", "Snow-Covered Island", "Snow-Covered Swamp",
    "Snow-Covered Mountain", "Snow-Covered Forest", "Snow-Covered Wastes",
}


def _is_ramp(bucket, text):
    if bucket == "land":
        return False
    t = (text or "").lower()
    if "add {" in t or "add one mana" in t or "add two mana" in t or "add three mana" in t:
        return True
    if "search your library for" in t and "land" in t:
        return True
    return False


def _is_draw(text):
    t = (text or "").lower()
    return bool(re.search(r"draws? \w+ cards?", t)) or "draw cards" in t or "draws cards" in t


_INTERACTION = ("destroy target", "destroy all", "destroy each", "exile target",
                "exile all", "counter target", "return target", "return all")

# -X/-X coletivo: "creatures ... get -" (Toxic Deluge) OU "each creature gets -"
# (The Meathook Massacre). "each creature"/"creatures" separa wipe de debuff de alvo
# único ("target creature gets -2/-2", que NÃO casa nenhum dos dois).
_MASS_DEBUFF = re.compile(r"\bcreatures\b[^.\n]{0,30}\bget -[\dx]|\beach creature gets -[\dx]")


def _is_mass_removal(t):
    """Reset de board que NÃO diz 'destroy/exile all': -X/-X em massa ou overload que
    troca 'target' por 'each' (ex.: Toxic Deluge, Languish, Damn em overload).
    Recebe o texto já em minúsculas."""
    if _MASS_DEBUFF.search(t):
        return True
    return "overload" in t and ("destroy target" in t or "exile target" in t)


def _is_interaction(text):
    t = (text or "").lower()
    return any(k in t for k in _INTERACTION) or _is_mass_removal(t)


def _is_tutor(text):
    # tutores genéricos ("Search your library for a card") — não conta busca-terreno (isso é ramp)
    return "search your library for a card" in (text or "").lower()


def _is_wipe(text):
    t = (text or "").lower()
    if "destroy all" in t or "exile all" in t or "destroy each" in t or "exile each" in t:
        return True
    return _is_mass_removal(t)


def _is_counter(text):
    return "counter target" in (text or "").lower()


def _is_instant_speed(type_line, text):
    return "instant" in (type_line or "").lower() or "flash" in (text or "").lower()


def _deck_gaps(*, lands, ramp, draw, interaction, wipes, counters,
               instant_interaction, avg_cmc, identity, complete):
    """Lista de buracos/pontos fracos do deck, em linguagem direta e acionável.
    Alvos são guias de Commander (heurística), não regra absoluta."""
    gaps = []

    def add(sev, text):
        gaps.append({"severity": sev, "text": text})

    if not complete:
        add("alto", "Deck incompleto (≠100 cartas) — complete antes de avaliar os buracos.")
    if instant_interaction < 4:
        add("alto", f"Só {instant_interaction} resposta(s) em velocidade de instante — é por isso "
                    "que você fica sem reação no turno dos outros. Mire 5+ (remoção instantânea, "
                    "proteção, counters).")
    if interaction < 7:
        add("alto", f"Pouca interação no total ({interaction}). Mire ~8–10 entre remoção e counters.")
    if wipes < 2:
        add("medio", f"Poucos board wipes ({wipes}). 2–3 ajudam a resetar quando o board foge.")
    if "U" in identity and counters == 0:
        add("baixo", "Sem counterspells — você joga azul; 2–3 dão resposta proativa a combo/wrath.")
    if draw < 8:
        add("medio", f"Compra baixa ({draw}). Mire 10+ pra não ficar sem gás.")
    if ramp < 9:
        add("medio", f"Ramp baixo ({ramp}). ~10 acelera o plano.")
    if lands < 35:
        add("alto", f"Poucos terrenos ({lands}) — 36–38 é o padrão; menos trava de mana.")
    elif lands > 40:
        add("baixo", f"Muitos terrenos ({lands}). Dá pra cortar 1–2 por mais ação.")
    if avg_cmc > 3.6:
        add("baixo", f"Curva alta (CMC médio {avg_cmc}). Baixar ajuda a agir mais cedo.")
    if not gaps:
        add("ok", "Sem buracos óbvios — interação, ramp, compra e manabase dentro dos alvos.")

    order = {"alto": 0, "medio": 1, "baixo": 2, "ok": 3}
    gaps.sort(key=lambda g: order.get(g["severity"], 9))
    return gaps


def combos_in_deck(names, limit=60):
    if not names:
        return []
    return _rows("""
        SELECT id, card_names, results, steps, prerequisites FROM combos
        WHERE card_names <@ %(names)s::text[] AND array_length(card_names, 1) >= 2
        ORDER BY array_length(card_names, 1)
        LIMIT %(limit)s
    """, {"names": sorted(set(names)), "limit": limit})


def _flag(value, low, high=None):
    if value < low:
        return "baixo"
    if high is not None and value > high:
        return "alto"
    return "ok"


# Subconjunto da lista oficial "Game Changers" da WotC (Commander Brackets).
# Aproximado — usado só como sinal pra estimar o bracket.
GAME_CHANGERS = {
    "Mana Crypt", "Mana Vault", "Jeweled Lotus", "Chrome Mox", "Mox Diamond",
    "Grim Monolith", "Lion's Eye Diamond", "Ancient Tomb", "Gaea's Cradle",
    "The Tabernacle at Pendrell Vale", "Mishra's Workshop", "Glacial Chasm",
    "Demonic Tutor", "Vampiric Tutor", "Imperial Seal", "Grim Tutor",
    "Enlightened Tutor", "Mystical Tutor", "Tainted Pact", "Demonic Consultation",
    "Thassa's Oracle", "Underworld Breach", "Necropotence", "Ad Nauseam",
    "Bolas's Citadel", "Cyclonic Rift", "Rhystic Study", "Mystic Remora",
    "Smothering Tithe", "Esper Sentinel", "Trouble in Pairs", "Aura Shards",
    "Opposition Agent", "Drannith Magistrate", "Notion Thief", "Consecrated Sphinx",
    "Fierce Guardianship", "Deflecting Swat", "Gifts Ungiven", "Intuition",
    "Expropriate", "Field of the Dead", "Grand Arbiter Augustin IV",
}


MASS_LAND_DENIAL = {
    "Armageddon", "Ravages of War", "Catastrophe", "Jokulhaups", "Obliterate",
    "Decree of Annihilation", "Wildfire", "Burning of Xinye", "Impending Disaster",
    "Boom // Bust", "Sundering Titan",
}


def _is_mld(name, text):
    return name in MASS_LAND_DENIAL or "destroy all lands" in (text or "").lower()


def _is_extra_turn(text):
    return "extra turn" in (text or "").lower()


def _is_win_combo(combo):
    """Combo de 2 cartas que loopa/ganha — o que joga o deck pro bracket 4+."""
    if len(combo["card_names"]) != 2:
        return False
    txt = " ".join(combo.get("results") or []).lower()
    return "infinite" in txt or "loses the game" in txt or "wins the game" in txt


def _deck_bracket(gc, two_card_combos, mld, extra_turns, total_combos):
    """Estimativa de bracket WotC (NÃO é veredito oficial).

    Regras (Brackets beta): bracket 3 permite até 3 game changers e combos de 2 cartas
    *desde que* não montem antes do turno 6; proíbe MLD e encadeamento de turnos extras.
    Bracket 4 não tem restrição (além do banido).

    Só dá pra detectar com CONFIANÇA o que joga pro 4: >3 game changers, MLD, turnos extras.
    A velocidade do combo (antes/depois do turno 6) NÃO dá pra medir automaticamente — então
    combos de 2 cartas viram um AVISO, não um veredito."""
    hard = []
    if len(gc) > 3:
        hard.append(f"{len(gc)} game changers (bracket 3 permite até 3)")
    if mld:
        hard.append("destruição em massa de terrenos")
    if extra_turns:
        hard.append("encadeamento de turnos extras")

    note = None
    if two_card_combos:
        note = (
            f"{two_card_combos} combo(s) de 2 cartas presente(s). Pela regra, se algum montar "
            "ANTES do turno 6 o deck é Bracket 4; combos tardios cabem no 3. A velocidade não dá "
            "pra calcular automaticamente — esse julgamento é seu."
        )

    if hard:
        return {"level": 4, "name": "Optimized (alto poder)",
                "reason": "proibido nos brackets 1-3: " + "; ".join(hard), "note": note}
    if gc or total_combos:
        det = []
        if gc:
            det.append(f"{len(gc)} game changer(s) (até 3 é permitido)")
        if total_combos:
            det.append(f"{total_combos} combo(s) presente(s)")
        return {"level": 3, "name": "Upgraded", "reason": "; ".join(det), "note": note}
    return {"level": 2, "name": "Core",
            "reason": "sem game changers, combos, MLD ou turnos extras", "note": None}


# ---- Rank de Poder & Consistência (heurístico, NÃO é taxa de vitória) ----

def _band(v, lo, hi, hard_lo, hard_hi):
    """10 dentro de [lo,hi]; decai linear até 0 nos extremos hard_lo/hard_hi."""
    if lo <= v <= hi:
        return 10.0
    if v < lo:
        return round(max(0.0, 10.0 * (v - hard_lo) / (lo - hard_lo)), 1) if lo > hard_lo else 0.0
    return round(max(0.0, 10.0 * (hard_hi - v) / (hard_hi - hi)), 1) if hard_hi > hi else 0.0


def _band_soft_high(v, lo, hi, hard_lo, floor=8.0, slope=0.25):
    """Como _band no lado BAIXO (pouca coisa é ruim), mas o lado ALTO não despenca:
    acima de hi há retorno decrescente leve com piso. Ter MAIS ramp/compra/interação
    não te pune — um deck com muita resposta não vale menos que um com a quantia 'ideal'."""
    if v < lo:
        return _band(v, lo, hi, hard_lo, hi + 1)
    if v <= hi:
        return 10.0
    return max(floor, round(10.0 - (v - hi) * slope, 1))


def _curve_score(avg):  # curva mais baixa = mais consistente
    if avg <= 2.8:
        return 10.0
    if avg >= 4.5:
        return 0.0
    return round(10.0 * (4.5 - avg) / (4.5 - 2.8), 1)


def _power_rank(*, lands, ramp, draw, interaction, avg_cmc, combos, gc, tutors, complete):
    """Score 0-100 de quão bem montado/forte o deck é. Reaproveita os números da análise.
    NÃO é probabilidade de ganhar — não modela oponentes, pilotagem nem sorte."""
    # terrenos MANTÊM penalidade no topo (flood é fraqueza real); ramp/compra/interação não:
    # ter de sobra não te deixa pior, só rende menos (piso 8.0). Antes draw=20/inter=17 davam ~0.
    s_lands = _band(lands, 35, 39, 28, 45)
    s_ramp = _band_soft_high(ramp, 9, 14, 2)
    s_draw = _band_soft_high(draw, 8, 13, 2)
    s_curve = _curve_score(avg_cmc)
    consistency = round((s_lands + s_ramp + s_draw + s_curve) / 4, 1)
    inter = _band_soft_high(interaction, 8, 12, 2)
    threat = round(min(10.0, 2.0 + min(combos, 4) * 1.3 + min(gc, 5) * 0.8 + min(tutors, 6) * 0.4), 1)

    overall = round((consistency * 0.40 + inter * 0.25 + threat * 0.35) * 10)
    if not complete:
        overall = min(overall, 55)  # deck incompleto não pode pontuar alto

    # rótulo de poder (descritivo; NÃO afirma cEDH — isso depende de sinais que não dá pra medir)
    label = ("Altíssimo poder" if overall >= 85 else "Forte" if overall >= 70
             else "Sólido" if overall >= 55 else "Casual+" if overall >= 40
             else "Casual / em construção")

    axes = [
        {"key": "consistencia", "label": "Consistência", "score": consistency,
         "detail": f"{lands} terrenos · {ramp} ramp · {draw} compra · CMC {avg_cmc}"},
        {"key": "interacao", "label": "Interação", "score": inter,
         "detail": f"{interaction} peça(s) de remoção/proteção"},
        {"key": "poder", "label": "Ameaça / poder", "score": threat,
         "detail": f"{combos} combo(s) · {gc} game changer(s) · {tutors} tutor(es)"},
    ]
    weakest = min(axes, key=lambda a: a["score"])
    verdict = f"Ponto mais fraco: {weakest['label'].lower()}." if overall < 70 else "Deck redondo e afiado."
    return {"score": overall, "label": label, "axes": axes, "verdict": verdict,
            "note": None if complete else "Deck incompleto (≠100 cartas) — score limitado."}


def _mana_sources(rows, idset):
    """Fontes de mana por cor, contadas pelo que a carta REALMENTE produz
    (Scryfall `produced_mana`), e não pela color identity.

    Por que não color_identity: terreno tipo Command Tower / Exotic Orchard /
    Urborg tem color identity vazia mas É fonte da sua cor; já uma carta colorida
    sem habilidade de mana (um removal preto, p.ex.) tem identity B mas NÃO é
    fonte. `produced_mana` corrige os dois lados de uma vez.

    Cores "any color" (Command Tower lista WUBRG) são limitadas à identidade do
    deck — numa deck mono-preta a Command Tower conta só como fonte de B, não das
    cinco. Mana incolor ({C}) é fonte válida pra qualquer deck (terrenos que geram
    só incolor — Reliquary Tower, Ancient Tomb — contam em 'C'), então NÃO é
    amarrado à identidade.
    """
    src = {"W": 0, "U": 0, "B": 0, "R": 0, "G": 0, "C": 0}
    for r in rows:
        q = r.get("qty") or 1
        for c in (r.get("produced_mana") or []):
            if c == "C":
                src["C"] += q
            elif c in idset and c in src:
                src[c] += q
    return src


def deck_analysis(deck_id):
    if not _rows("SELECT 1 FROM decks WHERE id=%(id)s", {"id": deck_id}):
        return None  # deck inexistente → a rota devolve 404 (em vez de análise vazia falsa)
    cards = _deck_cards(deck_id)
    total = sum((r["qty"] or 1) for r in cards)
    types = {}
    curve = {str(i): 0 for i in range(7)}
    curve["7+"] = 0
    lands = ramp = draw = interaction = tutors = 0
    wipes = counters = instant_interaction = 0
    cmc_sum = cmc_n = 0
    price = price_eur = price_tix = price_mp = 0.0
    # valor "base" = impressão mais barata por carta (ignora a arte escolhida); o de cima é o "atual"
    price_base = price_eur_base = price_tix_base = 0.0
    missing_price, pool = [], []
    for r in cards:
        q = r["qty"] or 1
        b = _bucket(r["type_line"])
        types[b] = types.get(b, 0) + q
        if b == "land":
            lands += q
        else:
            cmc = int(r["cmc"]) if r["cmc"] is not None else 0
            curve["7+" if cmc >= 7 else str(cmc)] += q
            cmc_sum += cmc * q
            cmc_n += q
        if _is_ramp(b, r["oracle_text"]):
            ramp += q
        if _is_draw(r["oracle_text"]):
            draw += q
        if _is_interaction(r["oracle_text"]):
            interaction += q
            if _is_instant_speed(r["type_line"], r["oracle_text"]):
                instant_interaction += q
        if _is_wipe(r["oracle_text"]):
            wipes += q
        if _is_counter(r["oracle_text"]):
            counters += q
        if _is_tutor(r["oracle_text"]):
            tutors += q
        if r["name"] in BASIC_LAND_NAMES:
            pass  # básicos não contam no preço
        else:
            if r["usd"] is not None:
                price += float(r["usd"]) * q
            else:
                missing_price.append(r["name"])
            if r.get("eur") is not None:
                price_eur += float(r["eur"]) * q
            if r.get("tix") is not None:
                price_tix += float(r["tix"]) * q
            if r.get("manapool") is not None:
                price_mp += float(r["manapool"]) * q
            if r.get("usd_base") is not None:
                price_base += float(r["usd_base"]) * q
            if r.get("eur_base") is not None:
                price_eur_base += float(r["eur_base"]) * q
            if r.get("tix_base") is not None:
                price_tix_base += float(r["tix_base"]) * q
        pool.append(r["name"])
    predominant = max((t for t in types if t != "land"), key=lambda k: types[k], default=None)
    combos_present = combos_in_deck(pool)

    cmd = next((r for r in cards if r["is_commander"]), None)
    identity = (
        sorted(cmd["color_identity"]) if (cmd and cmd["color_identity"])
        else sorted({c for r in cards for c in (r["color_identity"] or [])})
    )
    idset = set(identity)
    # Fontes de mana por cor pelo que a carta produz, não pela color identity (ver _mana_sources).
    colors = _mana_sources(cards, idset)
    off_color = sorted({r["name"] for r in cards if set(r["color_identity"] or []) - idset})
    gc = sorted({r["name"] for r in cards if r["name"] in GAME_CHANGERS})
    mld = any(_is_mld(r["name"], r["oracle_text"]) for r in cards)
    extra_turns = any(_is_extra_turn(r["oracle_text"]) for r in cards)
    two_card_win = sum(1 for c in combos_present if _is_win_combo(c))
    avg_cmc = round(cmc_sum / cmc_n, 2) if cmc_n else 0
    complete = total == 100
    power = _power_rank(
        lands=lands, ramp=ramp, draw=draw, interaction=interaction, avg_cmc=avg_cmc,
        combos=len(combos_present), gc=len(gc), tutors=tutors, complete=complete,
    )
    gaps = _deck_gaps(
        lands=lands, ramp=ramp, draw=draw, interaction=interaction, wipes=wipes,
        counters=counters, instant_interaction=instant_interaction, avg_cmc=avg_cmc,
        identity=identity, complete=complete,
    )

    return {
        "total_cards": total,
        "types": types,
        "predominant_type": predominant,
        "curve": curve,
        "avg_cmc": avg_cmc,
        "colors": colors,
        "identity": identity,
        "completeness": {
            "total": total,
            "complete": total == 100,
            "has_commander": cmd is not None,
            "off_color": off_color,
        },
        "bracket": _deck_bracket(gc, two_card_win, mld, extra_turns, len(combos_present)),
        "power": power,
        "gaps": gaps,
        "interaction_detail": {
            "total": interaction, "instant_speed": instant_interaction,
            "wipes": wipes, "counters": counters,
        },
        "game_changers": gc,
        # Limiares são guias de Commander (heurística), não regra absoluta.
        "health": {
            "lands": {"value": lands, "status": _flag(lands, 35, 41), "alvo": "36-38"},
            "ramp": {"value": ramp, "status": _flag(ramp, 10), "alvo": "10-12"},
            "draw": {"value": draw, "status": _flag(draw, 8), "alvo": "8-12"},
            "interaction": {"value": interaction, "status": _flag(interaction, 6), "alvo": "8-10"},
        },
        "price_usd": round(price, 2),
        "price_eur": round(price_eur, 2),
        "price_tix": round(price_tix, 2),
        "price_manapool": round(price_mp, 2),
        # "base" = soma da impressão mais barata de cada carta (Scryfall); ManaPool já é base por nome
        "price_usd_base": round(price_base, 2),
        "price_eur_base": round(price_eur_base, 2),
        "price_tix_base": round(price_tix_base, 2),
        "missing_price": missing_price,
        "combos_present": combos_present,
    }


def suggest_cards(commander_name, limit=40):
    """Sugere cartas pro comandante: peças que dividem combo com ele primeiro,
    depois dentro da identidade de cor + legais, ordenado por popularidade."""
    base = _rows("SELECT color_identity FROM cards WHERE name = %(n)s LIMIT 1",
                 {"n": commander_name})
    if not base:
        return []
    identity = base[0]["color_identity"] or []
    pieces = [r["name"] for r in _rows(
        "SELECT DISTINCT unnest(card_names) AS name FROM combos WHERE %(c)s = ANY(card_names)",
        {"c": commander_name})]
    sql = f"""
        SELECT {_card_cols()}, (name = ANY(%(pieces)s)) AS combo_piece
        FROM cards
        WHERE color_identity <@ %(identity)s
          AND (legalities->>'commander') = 'legal'
          AND name <> %(cmd)s
          AND type_line NOT ILIKE '%%Basic Land%%'
        ORDER BY (name = ANY(%(pieces)s)) DESC, edhrec_rank NULLS LAST
        LIMIT %(limit)s
    """
    return _rows(sql, {"pieces": pieces, "identity": identity, "cmd": commander_name,
                       "limit": _limit(limit, 40, 100)})


def symbol_map():
    """{ '{W}': svg_uri, '{T}': svg_uri, ... } — símbolos oficiais do Scryfall."""
    return {r["symbol"]: r["svg_uri"] for r in _rows("SELECT symbol, svg_uri FROM card_symbols")}

