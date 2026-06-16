"""Validação de completude/qualidade dos dados ingeridos.

Uso (venv ativa, a partir da raiz):  python query/validate.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from mtg_brain import config, db, http  # noqa: E402


def q(sql):
    with db.connect() as conn, conn.cursor() as cur:
        cur.execute(sql)
        return cur.fetchall()


def main():
    print("Contagens por tabela:", db.counts())

    print("\n-- Cartas: integridade da data de lançamento --")
    print("  sem released_at:", q("SELECT count(*) FROM cards WHERE released_at IS NULL")[0][0])
    print("  released_at min/max:", q("SELECT min(released_at), max(released_at) FROM cards")[0])

    print("\n-- 5 cartas mais recentes (nome | set | data) --")
    for r in q("SELECT name, set_code, released_at FROM cards "
               "ORDER BY released_at DESC NULLS LAST LIMIT 5"):
        print("  -", " | ".join(str(x) for x in r))

    print("\n-- 5 sets mais recentes (codigo | nome | data) --")
    for r in q("SELECT code, name, released_at FROM sets "
               "ORDER BY released_at DESC NULLS LAST LIMIT 5"):
        print("  -", " | ".join(str(x) for x in r))

    print("\n-- Cross-check contra o Scryfall (fonte autoritativa) --")
    d = http.get_json(config.SCRYFALL_API + "/cards/search",
                      params={"q": "game:paper", "unique": "cards"})
    print("  cartas unicas em papel (Scryfall):", d.get("total_cards"))
    print("  cartas no nosso banco (inclui tokens/digital):",
          q("SELECT count(*) FROM cards")[0][0])


if __name__ == "__main__":
    main()
