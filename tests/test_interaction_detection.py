"""Testes das heurísticas de remoção/wipe em queries.py (puros, sem DB).

Rodar: `PYTHONPATH=. .venv/Scripts/python.exe tests/test_interaction_detection.py`

Cobre o gap onde board wipes que não dizem "destroy all" eram subcontados
(Toxic Deluge: "-X/-X" em massa; Damn: overload que vira "each").
"""
from mtg_brain.queries import _is_wipe, _is_interaction

# Textos de oráculo reais (Scryfall).
TOXIC_DELUGE = ("As an additional cost to cast this spell, pay X life.\n"
                "All creatures get -X/-X until end of turn.")
DAMN = ('Destroy target creature. A creature destroyed this way can\'t be regenerated.\n'
        'Overload {2}{W}{W} (You may cast this spell for its overload cost. '
        'If you do, change "target" in its text to "each.")')
KINDRED_DOMINANCE = ("Choose a creature type. Destroy all creatures that aren't of the chosen type.")
LANGUISH = "All creatures get -4/-4 until end of turn."
IN_GARRUKS_WAKE = "Destroy all creatures you don't control."

# Não-wipes que NÃO podem ser contados como reset de board.
DISFIGURE = "Target creature gets -2/-2 until end of turn."  # alvo único
DICTATE_EREBOS = ("Flash\nWhenever a creature you control dies, each opponent "
                  "sacrifices a creature of their choice.")  # edict, não wipe
GRAVE_PACT = ("Whenever a creature you control dies, each other player "
              "sacrifices a creature of their choice.")  # edict
SAC_OUTLET = "Sacrifice a creature: Add {C}{C}."  # outlet de sacrifício
SPOT_REMOVAL = "Destroy target creature."  # remoção pontual
PUMP = "Creatures you control get +2/+2 until end of turn."  # buff, não debuff
COUNTER = "Counter target spell."


def check(label, got, want):
    status = "ok" if got == want else "FALHOU"
    if got != want:
        check.failed += 1
    print(f"  [{status}] {label}: esperado {want}, obtido {got}")


check.failed = 0


def main():
    print("_is_wipe — deve ser True:")
    for name, txt in [("Toxic Deluge", TOXIC_DELUGE), ("Damn (overload)", DAMN),
                      ("Kindred Dominance", KINDRED_DOMINANCE), ("Languish", LANGUISH),
                      ("In Garruk's Wake", IN_GARRUKS_WAKE)]:
        check(name, _is_wipe(txt), True)

    print("_is_wipe — deve ser False (não é reset de board):")
    for name, txt in [("Disfigure (alvo único)", DISFIGURE), ("Dictate of Erebos (edict)", DICTATE_EREBOS),
                      ("Grave Pact (edict)", GRAVE_PACT), ("Sac outlet", SAC_OUTLET),
                      ("Remoção pontual", SPOT_REMOVAL), ("Pump +X/+X", PUMP)]:
        check(name, _is_wipe(txt), False)

    print("_is_interaction — deve ser True:")
    for name, txt in [("Toxic Deluge", TOXIC_DELUGE), ("Damn", DAMN),
                      ("Kindred Dominance", KINDRED_DOMINANCE), ("Counter", COUNTER)]:
        check(name, _is_interaction(txt), True)

    print("_is_interaction — deve ser False:")
    for name, txt in [("Dictate of Erebos (edict)", DICTATE_EREBOS), ("Pump +X/+X", PUMP)]:
        check(name, _is_interaction(txt), False)

    print()
    if check.failed:
        print(f"RESULTADO: {check.failed} caso(s) falharam.")
        raise SystemExit(1)
    print("RESULTADO: todos os casos passaram.")


if __name__ == "__main__":
    main()
