"""Gera embeddings semânticos das cartas (fastembed) e guarda em cards.embedding (pgvector).

Roda no container do app (Python 3.12, onde o fastembed/onnxruntime instala):
    docker compose exec app python -m mtg_brain ingest embeddings

Texto embedado = nome + tipo + texto de oráculo. Idempotente (re-popula tudo via
COPY pra uma temp table + UPDATE; cria o índice HNSW depois de popular).
"""
from .. import db, embed


def ingest_embeddings():
    with db.connect() as conn:
        with conn.cursor() as cur:
            cur.execute("CREATE EXTENSION IF NOT EXISTS vector")
            cur.execute(f"ALTER TABLE cards ADD COLUMN IF NOT EXISTS embedding vector({embed.DIM})")
            conn.commit()
            cur.execute("SELECT id::text, name, type_line, oracle_text FROM cards")
            rows = cur.fetchall()

        ids = [r[0] for r in rows]
        texts = [". ".join(p for p in (r[1], r[2], r[3]) if p) for r in rows]

        n = 0
        with conn.cursor() as cur:
            cur.execute(f"CREATE TEMP TABLE _emb (id text PRIMARY KEY, "
                        f"embedding vector({embed.DIM})) ON COMMIT DROP")
            with cur.copy("COPY _emb (id, embedding) FROM STDIN") as cp:
                for i, vec in enumerate(embed.model().embed(texts, batch_size=256)):
                    cp.write_row((ids[i], embed.to_literal(vec)))
                    n += 1
            cur.execute("UPDATE cards c SET embedding = e.embedding "
                        "FROM _emb e WHERE c.id::text = e.id")
            cur.execute("CREATE INDEX IF NOT EXISTS cards_embedding_hnsw "
                        "ON cards USING hnsw (embedding vector_cosine_ops)")
        conn.commit()
    return n
