"""Consultas determinísticas (SQL parametrizado, SEM LLM) que a API expõe.

Rápidas e previsíveis — o LLM (brain.ask) fica só para o chat livre e para redigir
resumos. Cartas dupla-face têm image_uris NULL no topo, então a imagem cai para o
primeiro face em data->'card_faces'.
"""
import datetime
import re
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
    where, params = [], {"limit": min(int(limit or 60), 200)}
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
    where, params = [], {"limit": min(int(limit or 60), 200)}
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


def recommend_commanders(theme, colors=None, max_price=None, limit=60):
    where = ["(name ILIKE %(t)s OR type_line ILIKE %(t)s OR oracle_text ILIKE %(t)s)"]
    params = {"t": f"%{theme}%", "limit": min(int(limit or 60), 200)}
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
    return _rows(
        "SELECT id, name, commander, created_at, "
        "(SELECT count(*) FROM deck_cards dc WHERE dc.deck_id = decks.id) AS cards "
        "FROM decks ORDER BY created_at DESC"
    )


def add_card(deck_id, card_name, qty=1, is_commander=False):
    _write(
        "INSERT INTO deck_cards (deck_id, card_name, qty, is_commander) "
        "VALUES (%(d)s, %(n)s, %(q)s, %(c)s) "
        "ON CONFLICT (deck_id, card_name) DO UPDATE SET qty=EXCLUDED.qty, "
        "is_commander=EXCLUDED.is_commander",
        {"d": deck_id, "n": card_name, "q": qty, "c": is_commander},
    )
    return {"ok": True}


def remove_card(deck_id, card_name):
    _write("DELETE FROM deck_cards WHERE deck_id=%(d)s AND card_name=%(n)s",
           {"d": deck_id, "n": card_name})
    return {"ok": True}


def _deck_cards(deck_id):
    # Uma impressão (a mais barata) por nome, via LATERAL — máx ~100 lookups.
    return _rows(f"""
        SELECT dc.card_name AS name, dc.qty, dc.is_commander,
               c.type_line, c.cmc, c.mana_cost, c.color_identity, c.oracle_text,
               c.usd, c.image
        FROM deck_cards dc
        LEFT JOIN LATERAL (
            SELECT type_line, cmc, mana_cost, color_identity, oracle_text,
                   (prices->>'usd')::numeric AS usd, {_img('normal')} AS image
            FROM cards WHERE name = dc.card_name
            ORDER BY (prices->>'usd')::numeric ASC NULLS LAST LIMIT 1
        ) c ON true
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
    deck["cards"] = cards
    return deck


def _bucket(type_line):
    t = (type_line or "").lower()
    for key in ("land", "creature", "planeswalker", "instant", "sorcery",
                "artifact", "enchantment", "battle"):
        if key in t:
            return key
    return "outro"


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


def _is_interaction(text):
    t = (text or "").lower()
    return any(k in t for k in _INTERACTION)


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


def deck_analysis(deck_id):
    cards = _deck_cards(deck_id)
    total = sum((r["qty"] or 1) for r in cards)
    types, colors = {}, {"W": 0, "U": 0, "B": 0, "R": 0, "G": 0}
    curve = {str(i): 0 for i in range(7)}
    curve["7+"] = 0
    lands = ramp = draw = interaction = 0
    cmc_sum = cmc_n = 0
    price = 0.0
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
        for c in (r["color_identity"] or []):
            if c in colors:
                colors[c] += q
        if _is_ramp(b, r["oracle_text"]):
            ramp += q
        if _is_draw(r["oracle_text"]):
            draw += q
        if _is_interaction(r["oracle_text"]):
            interaction += q
        if r["usd"] is not None:
            price += float(r["usd"]) * q
        else:
            missing_price.append(r["name"])
        pool.append(r["name"])
    predominant = max((t for t in types if t != "land"), key=lambda k: types[k], default=None)
    combos_present = combos_in_deck(pool)

    cmd = next((r for r in cards if r["is_commander"]), None)
    identity = (
        sorted(cmd["color_identity"]) if (cmd and cmd["color_identity"])
        else sorted({c for r in cards for c in (r["color_identity"] or [])})
    )
    idset = set(identity)
    off_color = sorted({r["name"] for r in cards if set(r["color_identity"] or []) - idset})
    gc = sorted({r["name"] for r in cards if r["name"] in GAME_CHANGERS})
    mld = any(_is_mld(r["name"], r["oracle_text"]) for r in cards)
    extra_turns = any(_is_extra_turn(r["oracle_text"]) for r in cards)
    two_card_win = sum(1 for c in combos_present if _is_win_combo(c))

    return {
        "total_cards": total,
        "types": types,
        "predominant_type": predominant,
        "curve": curve,
        "avg_cmc": round(cmc_sum / cmc_n, 2) if cmc_n else 0,
        "colors": colors,
        "identity": identity,
        "completeness": {
            "total": total,
            "complete": total == 100,
            "has_commander": cmd is not None,
            "off_color": off_color,
        },
        "bracket": _deck_bracket(gc, two_card_win, mld, extra_turns, len(combos_present)),
        "game_changers": gc,
        # Limiares são guias de Commander (heurística), não regra absoluta.
        "health": {
            "lands": {"value": lands, "status": _flag(lands, 35, 41), "alvo": "36-38"},
            "ramp": {"value": ramp, "status": _flag(ramp, 10), "alvo": "10-12"},
            "draw": {"value": draw, "status": _flag(draw, 8), "alvo": "8-12"},
            "interaction": {"value": interaction, "status": _flag(interaction, 6), "alvo": "8-10"},
        },
        "price_usd": round(price, 2),
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
                       "limit": min(int(limit or 40), 100)})
