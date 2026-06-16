"""Ingestão do Scryfall: cartas, rulings, sets e catálogos (keywords/mecânicas).

Cartas e rulings vêm dos arquivos *bulk* (baixados 1x/dia e processados localmente),
conforme recomendado pelo Scryfall. Sets e catálogos são pequenos e vêm da API ao vivo.
"""
import os

import ijson
from psycopg.types.json import Jsonb

from .. import config, db, http

BULK_META = config.SCRYFALL_API + "/bulk-data"

# ----------------------------------------------------------------------------- cards

CARD_UPSERT = """
INSERT INTO cards (id, oracle_id, name, lang, released_at, mana_cost, cmc, type_line,
    oracle_text, power, toughness, loyalty, colors, color_identity, keywords, rarity,
    set_code, collector_number, edhrec_rank, layout, reserved, legalities, prices,
    image_uris, related_uris, data)
VALUES (%(id)s, %(oracle_id)s, %(name)s, %(lang)s, %(released_at)s, %(mana_cost)s, %(cmc)s,
    %(type_line)s, %(oracle_text)s, %(power)s, %(toughness)s, %(loyalty)s, %(colors)s,
    %(color_identity)s, %(keywords)s, %(rarity)s, %(set_code)s, %(collector_number)s,
    %(edhrec_rank)s, %(layout)s, %(reserved)s, %(legalities)s, %(prices)s, %(image_uris)s,
    %(related_uris)s, %(data)s)
ON CONFLICT (id) DO UPDATE SET
    oracle_id=EXCLUDED.oracle_id, name=EXCLUDED.name, lang=EXCLUDED.lang,
    released_at=EXCLUDED.released_at, mana_cost=EXCLUDED.mana_cost, cmc=EXCLUDED.cmc,
    type_line=EXCLUDED.type_line, oracle_text=EXCLUDED.oracle_text, power=EXCLUDED.power,
    toughness=EXCLUDED.toughness, loyalty=EXCLUDED.loyalty, colors=EXCLUDED.colors,
    color_identity=EXCLUDED.color_identity, keywords=EXCLUDED.keywords, rarity=EXCLUDED.rarity,
    set_code=EXCLUDED.set_code, collector_number=EXCLUDED.collector_number,
    edhrec_rank=EXCLUDED.edhrec_rank, layout=EXCLUDED.layout, reserved=EXCLUDED.reserved,
    legalities=EXCLUDED.legalities, prices=EXCLUDED.prices, image_uris=EXCLUDED.image_uris,
    related_uris=EXCLUDED.related_uris, data=EXCLUDED.data, ingested_at=now();
"""


def _jsonb(value):
    return Jsonb(value) if value is not None else None


def _int(value):
    return int(value) if value is not None else None


def _card_row(c):
    return {
        "id": c.get("id"),
        "oracle_id": c.get("oracle_id"),
        "name": c.get("name"),
        "lang": c.get("lang"),
        "released_at": c.get("released_at") or None,
        "mana_cost": c.get("mana_cost"),
        "cmc": c.get("cmc"),
        "type_line": c.get("type_line"),
        "oracle_text": c.get("oracle_text"),
        "power": c.get("power"),
        "toughness": c.get("toughness"),
        "loyalty": c.get("loyalty"),
        "colors": c.get("colors"),
        "color_identity": c.get("color_identity"),
        "keywords": c.get("keywords"),
        "rarity": c.get("rarity"),
        "set_code": c.get("set"),
        "collector_number": c.get("collector_number"),
        "edhrec_rank": _int(c.get("edhrec_rank")),
        "layout": c.get("layout"),
        "reserved": c.get("reserved"),
        "legalities": _jsonb(c.get("legalities")),
        "prices": _jsonb(c.get("prices")),
        "image_uris": _jsonb(c.get("image_uris")),
        "related_uris": _jsonb(c.get("related_uris")),
        "data": Jsonb(c),
    }


def _bulk_uri(bulk_type):
    meta = http.get_json(BULK_META)
    for entry in meta["data"]:
        if entry["type"] == bulk_type:
            return entry["download_uri"]
    raise ValueError(f"bulk type '{bulk_type}' não encontrado no Scryfall")


def _stream_bulk(bulk_type, filename, upsert_sql, row_fn):
    uri = _bulk_uri(bulk_type)
    dest = os.path.join(config.DATA_DIR, filename)
    http.download(uri, dest)
    total, buf = 0, []
    with db.connect() as conn, open(dest, "rb") as f:
        # use_float=True evita ijson devolver Decimal (que quebraria o json.dumps do jsonb)
        for obj in ijson.items(f, "item", use_float=True):
            buf.append(row_fn(obj))
            if len(buf) >= 1000:
                total += db.upsert_batch(conn, upsert_sql, buf)
                buf.clear()
        if buf:
            total += db.upsert_batch(conn, upsert_sql, buf)
    return total


def ingest_cards():
    return _stream_bulk("oracle_cards", "oracle_cards.json", CARD_UPSERT, _card_row)


# --------------------------------------------------------------------------- rulings

RULING_UPSERT = """
INSERT INTO rulings (oracle_id, source, published_at, comment)
VALUES (%(oracle_id)s, %(source)s, %(published_at)s, %(comment)s)
ON CONFLICT (oracle_id, comment) DO NOTHING;
"""


def _ruling_row(r):
    return {
        "oracle_id": r.get("oracle_id"),
        "source": r.get("source"),
        "published_at": r.get("published_at") or None,
        "comment": r.get("comment"),
    }


def ingest_rulings():
    return _stream_bulk("rulings", "rulings.json", RULING_UPSERT, _ruling_row)


# ------------------------------------------------------------------------------ sets

SET_UPSERT = """
INSERT INTO sets (code, name, released_at, set_type, card_count, digital, data)
VALUES (%(code)s, %(name)s, %(released_at)s, %(set_type)s, %(card_count)s, %(digital)s, %(data)s)
ON CONFLICT (code) DO UPDATE SET
    name=EXCLUDED.name, released_at=EXCLUDED.released_at, set_type=EXCLUDED.set_type,
    card_count=EXCLUDED.card_count, digital=EXCLUDED.digital, data=EXCLUDED.data;
"""


def ingest_sets():
    data = http.get_json(config.SCRYFALL_API + "/sets")
    rows = [
        {
            "code": s.get("code"),
            "name": s.get("name"),
            "released_at": s.get("released_at") or None,
            "set_type": s.get("set_type"),
            "card_count": s.get("card_count"),
            "digital": s.get("digital"),
            "data": Jsonb(s),
        }
        for s in data.get("data", [])
    ]
    with db.connect() as conn:
        return db.upsert_batch(conn, SET_UPSERT, rows)


# -------------------------------------------------------------------------- catalogs

CATALOGS = {
    "keyword-abilities": "keyword-ability",
    "keyword-actions": "keyword-action",
    "ability-words": "ability-word",
}

KEYWORD_UPSERT = """
INSERT INTO keywords (name, category) VALUES (%(name)s, %(category)s)
ON CONFLICT (name, category) DO NOTHING;
"""


def ingest_catalogs():
    rows = []
    for path, category in CATALOGS.items():
        data = http.get_json(config.SCRYFALL_API + "/catalog/" + path)
        rows.extend({"name": name, "category": category} for name in data.get("data", []))
    with db.connect() as conn:
        return db.upsert_batch(conn, KEYWORD_UPSERT, rows)


# --------------------------------------------------------------------------- prices

def ingest_prices():
    """Backfill de preços: o bulk 'oracle_cards' tem 1 impressão por carta e às vezes
    ela vem sem usd. Aqui pegamos o MENOR usd de QUALQUER impressão (bulk default_cards)
    e preenchemos cards.prices->>'usd' onde está faltando."""
    uri = _bulk_uri("default_cards")
    dest = os.path.join(config.DATA_DIR, "default_cards.json")
    http.download(uri, dest)
    best = {}
    with open(dest, "rb") as f:
        for c in ijson.items(f, "item", use_float=True):
            name = c.get("name")
            usd = (c.get("prices") or {}).get("usd") if name else None
            if usd is None:
                continue
            usd = float(usd)
            if name not in best or usd < best[name]:
                best[name] = usd
    with db.connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name FROM cards WHERE (prices->>'usd') IS NULL")
            missing = cur.fetchall()
        filled = 0
        with conn.cursor() as cur:
            for cid, name in missing:
                price = best.get(name)
                if price is None:
                    continue
                cur.execute(
                    "UPDATE cards SET prices = jsonb_set(COALESCE(prices, '{}'::jsonb), "
                    "'{usd}', to_jsonb(%(u)s::text)) WHERE id = %(id)s",
                    {"u": str(price), "id": cid})
                filled += 1
        conn.commit()
    print(f"    faltando usd: {len(missing)} | preenchidos: {filled}")
    return filled
