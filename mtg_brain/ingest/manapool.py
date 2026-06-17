"""Ingestão dos preços da ManaPool (https://manapool.com/api/v1/prices/singles).

Dump público e grátis (~50 MB, ~100k impressões, sem chave). Guardamos o menor preço
NM nonfoil por NOME (em USD) na tabela `manapool_prices`, pra usar como fonte de preço
default do deck (é o site que a galera usa pra definir o teto em dólar).

Atualize quando quiser:  python -m mtg_brain ingest manapool
"""
from .. import db, http

PRICES_URL = "https://manapool.com/api/v1/prices/singles"


def ingest_manapool():
    resp = http.session().get(PRICES_URL, timeout=120)
    resp.raise_for_status()
    best = {}  # nome -> menor USD (NM nonfoil)
    for c in resp.json().get("data", []):
        cents = c.get("price_cents_nm") or c.get("price_cents")
        name = c.get("name")
        if cents is None or not name:
            continue
        usd = cents / 100.0
        if name not in best or usd < best[name]:
            best[name] = usd
    with db.connect() as conn:
        with conn.cursor() as cur:
            cur.execute("CREATE TABLE IF NOT EXISTS manapool_prices "
                        "(name text PRIMARY KEY, usd numeric)")
            cur.execute("TRUNCATE manapool_prices")
            with cur.copy("COPY manapool_prices (name, usd) FROM STDIN") as cp:
                for name, usd in best.items():
                    cp.write_row((name, usd))
        conn.commit()
    return len(best)
