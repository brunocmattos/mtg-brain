"""Testes PYTEST puros (sem DB) para _mana_sources em mtg_brain/queries.py.

_mana_sources conta FONTES DE MANA por cor pelo que a carta realmente produz
(Scryfall produced_mana), NAO pela color identity. Cores "any color" (Command
Tower lista WUBRG) sao limitadas a identidade do deck; mana incolor ({C}) e
fonte valida pra qualquer deck.

Grupo: manabase
"""

from mtg_brain.queries import _mana_sources


def _card(name, produced, qty=1):
    return {"name": name, "produced_mana": produced, "qty": qty}


def test_swamp_conta_como_fonte_preta():
    src = _mana_sources([_card("Swamp", ["B"])], {"B"})
    assert src["B"] == 1
    assert src["W"] == src["U"] == src["R"] == src["G"] == 0


def test_command_tower_em_mono_preto_conta_so_preto():
    # produced_mana lista as 5 cores; numa deck mono-preta so pode ser B.
    src = _mana_sources([_card("Command Tower", ["W", "U", "B", "R", "G"])], {"B"})
    assert src["B"] == 1
    assert src["W"] == src["U"] == src["R"] == src["G"] == 0


def test_exotic_orchard_e_urborg_contam_preto_em_mono_preto():
    rows = [
        _card("Exotic Orchard", ["W", "U", "B", "R", "G"]),
        _card("Urborg, Tomb of Yawgmoth", ["B"]),
    ]
    src = _mana_sources(rows, {"B"})
    assert src["B"] == 2


def test_carta_colorida_sem_producao_nao_conta():
    # REGRESSAO do bug: removal preto tem color identity B mas NAO e fonte de mana.
    # Antes (contagem por color_identity) inflava B; agora produced_mana=None -> 0.
    rows = [
        _card("Deadly Rollick", None),
        _card("Dread Presence", None),
    ]
    src = _mana_sources(rows, {"B"})
    assert src["B"] == 0


def test_fonte_incolor_nao_e_cor_mas_conta_em_C():
    # "lands boas que geram sem cor" (Reliquary Tower, Ancient Tomb) e Sol Ring:
    # nao somam em cor nenhuma, mas sao fontes validas -> entram em 'C'.
    rows = [
        _card("Reliquary Tower", ["C"]),
        _card("Ancient Tomb", ["C"]),
        _card("Sol Ring", ["C"]),
    ]
    src = _mana_sources(rows, {"B"})
    assert src["B"] == 0
    assert src["C"] == 3


def test_incolor_conta_mesmo_fora_da_identidade():
    # {C} e usavel por qualquer deck -> nao e amarrado a idset (inclusive deck incolor).
    src = _mana_sources([_card("Wastes", ["C"])], set())
    assert src["C"] == 1


def test_qty_multiplica():
    src = _mana_sources([_card("Swamp", ["B"], qty=9)], {"B"})
    assert src["B"] == 9


def test_dual_conta_as_duas_cores_na_identidade():
    src = _mana_sources([_card("Watery Grave", ["U", "B"])], {"U", "B"})
    assert src["U"] == 1 and src["B"] == 1


def test_produtor_fora_da_cor_e_ignorado():
    # fonte verde numa deck mono-preta nao conta (cor fora da identidade).
    src = _mana_sources([_card("Llanowar Elves", ["G"])], {"B"})
    assert src["G"] == 0 and src["B"] == 0


def test_terra_que_faz_cor_e_incolor_conta_nos_dois():
    # land com "{T}: Add {B} or {C}" -> B (na identidade) e C.
    src = _mana_sources([_card("Tainted Field-ish", ["B", "C"])], {"B"})
    assert src["B"] == 1 and src["C"] == 1


def test_qty_ausente_assume_1():
    src = _mana_sources([{"name": "Swamp", "produced_mana": ["B"]}], {"B"})
    assert src["B"] == 1
