"""Consultas de demonstração contra o banco já ingerido.

Uso (com a venv ativa, a partir da raiz do projeto):
    python query/demo.py
"""
import os
import sys

# permite rodar como `python query/demo.py` a partir da raiz do projeto
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from mtg_brain import db  # noqa: E402

QUERIES = [
    (
        "Cartas de dreno pretas baratas (<= US$3), legais em Commander",
        """SELECT name, mana_cost, (prices->>'usd')
           FROM cards
           WHERE 'B' = ANY (color_identity)
             AND oracle_text ILIKE '%loses%life%'
             AND (legalities->>'commander') = 'legal'
             AND (prices->>'usd') IS NOT NULL
             AND (prices->>'usd')::numeric <= 3
           ORDER BY (prices->>'usd')::numeric ASC
           LIMIT 8""",
    ),
    (
        "Combos jogáveis na identidade UB do Wilhelt (mono-U, mono-B ou UB)",
        """SELECT array_to_string(card_names, ' + '), array_to_string(results, ', ')
           FROM combos
           WHERE color_identity ~ '^[UB]+$'
           LIMIT 8""",
    ),
    (
        "Combos que usam Gravecrawler",
        """SELECT array_to_string(card_names, ' + '), array_to_string(results, ', ')
           FROM combos
           WHERE 'Gravecrawler' = ANY (card_names)
           LIMIT 8""",
    ),
    (
        "Regras (mecânicas) que mencionam 'commander'",
        """SELECT rule_number, left(text, 90)
           FROM rules
           WHERE text ILIKE '%commander%'
           ORDER BY rule_number
           LIMIT 6""",
    ),
]


def main():
    print("Contagens por tabela:", db.counts())
    for title, sql in QUERIES:
        print(f"\n=== {title} ===")
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute(sql)
            rows = cur.fetchall()
            if not rows:
                print("   (sem resultados)")
            for r in rows:
                print("  -", " | ".join("" if x is None else str(x) for x in r))


if __name__ == "__main__":
    main()
