"""Acesso ao Postgres via psycopg 3."""
import os

import psycopg

from . import config

SCHEMA_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "db", "schema.sql"
)

TABLES = ["sets", "cards", "rulings", "keywords", "rules", "combos"]


def connect():
    return psycopg.connect(config.DATABASE_URL)


def apply_schema():
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        sql = f.read()
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()


def upsert_batch(conn, sql, rows, batch_size=1000):
    """Executa um upsert em lotes. `rows` é uma lista de dicts (parâmetros nomeados)."""
    total = 0
    with conn.cursor() as cur:
        for i in range(0, len(rows), batch_size):
            chunk = rows[i : i + batch_size]
            cur.executemany(sql, chunk)
            total += len(chunk)
    conn.commit()
    return total


def counts():
    out = {}
    with connect() as conn, conn.cursor() as cur:
        for t in TABLES:
            cur.execute(f"SELECT count(*) FROM {t}")
            out[t] = cur.fetchone()[0]
    return out
