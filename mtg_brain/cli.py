"""CLI do mtg-brain.

Uso:
    python -m mtg_brain init-db
    python -m mtg_brain ingest all
    python -m mtg_brain ingest cards combos
    python -m mtg_brain stats
"""
import argparse
import sys

from . import db
from .ingest import combos, manapool, rules, scryfall

INGESTORS = {
    "sets": scryfall.ingest_sets,
    "catalogs": scryfall.ingest_catalogs,
    "cards": scryfall.ingest_cards,
    "rulings": scryfall.ingest_rulings,
    "rules": rules.ingest_rules,
    "combos": combos.ingest_combos,
    "prices": scryfall.ingest_prices,
    "symbols": scryfall.ingest_symbols,
    "manapool": manapool.ingest_manapool,
}
# Ordem segura: sets/catalogs/cards/rulings antes de combos (mais pesado).
ORDER = ["sets", "catalogs", "cards", "rulings", "rules", "combos"]


def cmd_init_db(_):
    db.apply_schema()
    print("OK: schema aplicado.")


def cmd_ingest(args):
    targets = ORDER if "all" in args.targets else args.targets
    for t in targets:
        fn = INGESTORS.get(t)
        if fn is None:
            print(f"  ! alvo desconhecido: {t} (use: {', '.join(ORDER)}, all)")
            continue
        print(f"==> ingerindo: {t}")
        try:
            n = fn()
            print(f"    OK: {n} registros ({t})")
        except Exception as e:  # noqa: BLE001 — um alvo que falha não derruba os outros
            print(f"    FALHA em '{t}': {e}")


def cmd_stats(_):
    for table, n in db.counts().items():
        print(f"  {table:10} {n}")


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    p = argparse.ArgumentParser(prog="python -m mtg_brain",
                                description="mtg-brain: ingestão de dados de Magic")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("init-db", help="cria as tabelas no Postgres").set_defaults(func=cmd_init_db)

    pi = sub.add_parser("ingest", help="ingere dados de uma ou mais fontes")
    pi.add_argument("targets", nargs="+",
                    help="sets | catalogs | cards | rulings | rules | combos | all")
    pi.set_defaults(func=cmd_ingest)

    sub.add_parser("stats", help="conta registros por tabela").set_defaults(func=cmd_stats)

    args = p.parse_args()
    args.func(args)
