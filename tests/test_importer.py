"""Testes PYTEST puros (sem DB) do importador de decklist em mtg_brain.queries.

Cobre as funcoes puras `_clean_card_name` e `_parse_decklist`. NAO toca em nada
que conecte ao banco (import_deck/_resolve_card_name/_rows/_write, etc.).

Rodar:
    PYTHONPATH=. .venv/Scripts/python.exe -m pytest tests/test_importer.py -q
"""
from mtg_brain.queries import _clean_card_name, _parse_decklist


# =========================================================== _clean_card_name
# Regressoes dos bugs reais: a ORDEM importa. Tira foil '*F*' e '#123' ANTES,
# so depois o sufixo de set/colecao " (SET) 123" (ancorado no fim). Se o '*F*'
# nao saisse primeiro, ele travaria o strip do set e a carta viraria 'missing'.

def test_clean_strips_foil_marker():
    assert _clean_card_name("Sol Ring *F*") == "Sol Ring"


def test_clean_strips_etched_marker():
    # qualquer marcador de uma letra entre asteriscos (foil/etched)
    assert _clean_card_name("Sol Ring *E*") == "Sol Ring"


def test_clean_strips_collector_hash():
    assert _clean_card_name("Sol Ring #42") == "Sol Ring"


def test_clean_strips_set_and_collector():
    assert _clean_card_name("Sol Ring (C21) 263") == "Sol Ring"


def test_clean_strips_set_without_collector_number():
    assert _clean_card_name("Sol Ring (C21)") == "Sol Ring"


def test_clean_strips_set_collector_and_foil_in_order():
    # O caso que motivou a ordem: set + colecao + foil juntos no fim.
    assert _clean_card_name("Sol Ring (C21) 263 *F*") == "Sol Ring"


def test_clean_leaves_plain_name_untouched():
    assert _clean_card_name("Sol Ring") == "Sol Ring"


def test_clean_preserves_apostrophe_and_hyphen():
    # Nome com apostrofo e hifen nao pode ser mutilado.
    assert _clean_card_name("Lim-Dul's Vault") == "Lim-Dul's Vault"


def test_clean_preserves_double_faced_separator():
    # DFC do banco usa " // " — nao pode ser confundido com sufixo de set.
    assert _clean_card_name("Fire // Ice") == "Fire // Ice"


def test_clean_does_not_strip_leading_quantity():
    # COMPORTAMENTO REAL: _clean_card_name NAO remove a quantidade do inicio;
    # isso e papel do _parse_decklist (grupo de captura do regex). Aqui a qtd
    # permanece. (A doc do enunciado dizia '1 Sol Ring *F*' -> 'Sol Ring', mas
    # isso so vale via _parse_decklist, nao chamando _clean diretamente.)
    assert _clean_card_name("1 Sol Ring *F*") == "1 Sol Ring"


def test_clean_strips_surrounding_whitespace():
    assert _clean_card_name("  Sol Ring  ") == "Sol Ring"


# ============================================================= _parse_decklist
# Formato de retorno REAL: lista de dicts {"qty": int, "name": str,
# "is_commander": bool}.

def test_parse_line_with_quantity():
    items = _parse_decklist("1 Sol Ring")
    assert items == [{"qty": 1, "name": "Sol Ring", "is_commander": False}]


def test_parse_line_with_x_quantity():
    items = _parse_decklist("2x Forest")
    assert items == [{"qty": 2, "name": "Forest", "is_commander": False}]


def test_parse_multi_digit_quantity():
    items = _parse_decklist("10x Lightning Bolt")
    assert items == [{"qty": 10, "name": "Lightning Bolt", "is_commander": False}]


def test_parse_line_without_quantity_is_ignored():
    # COMPORTAMENTO REAL: o regex _CARD_LINE EXIGE digitos no inicio. Uma linha
    # sem quantidade ("Sol Ring") nao casa como carta — vira "cabecalho de secao"
    # e e descartada (nao gera item).
    assert _parse_decklist("Sol Ring") == []


def test_parse_strips_set_and_foil_from_card_line():
    # Aqui sim a qtd e separada pelo regex e o resto passa por _clean_card_name.
    items = _parse_decklist("1 Sol Ring (C21) 263 *F*")
    assert items == [{"qty": 1, "name": "Sol Ring", "is_commander": False}]


def test_parse_strips_leading_whitespace_and_spacing():
    items = _parse_decklist("   3   Llanowar Elves  ")
    assert items == [{"qty": 3, "name": "Llanowar Elves", "is_commander": False}]


def test_parse_skips_comments():
    # Linhas que comecam com '//' ou '#' sao comentarios e somem.
    items = _parse_decklist("// my deck\n# notes\n1 Sol Ring")
    assert items == [{"qty": 1, "name": "Sol Ring", "is_commander": False}]


def test_parse_skips_blank_lines():
    items = _parse_decklist("\n\n1 Sol Ring\n\n")
    assert items == [{"qty": 1, "name": "Sol Ring", "is_commander": False}]


def test_parse_empty_and_none_input():
    assert _parse_decklist("") == []
    assert _parse_decklist(None) == []


def test_parse_skips_sideboard_section():
    items = _parse_decklist("Sideboard\n1 Should Skip")
    assert items == []


def test_parse_skips_maybeboard_section():
    items = _parse_decklist("Maybeboard\n3 Also Skip")
    assert items == []


def test_parse_skips_various_skip_sections():
    for header in ("Sideboard", "Maybeboard", "Maybe", "Considering",
                   "Tokens", "Token", "Outside the game"):
        assert _parse_decklist(header + "\n1 Skipped Card") == [], header


def test_parse_section_resets_after_skip():
    # Depois de uma secao 'skip', um cabecalho normal religa o 'main'.
    items = _parse_decklist("Sideboard\n1 Skipme\nMainboard\n1 Keepme")
    assert items == [{"qty": 1, "name": "Keepme", "is_commander": False}]


def test_parse_commander_header_strict_marks_commander():
    items = _parse_decklist("Commander\n1 Atraxa, Praetors' Voice")
    assert items == [
        {"qty": 1, "name": "Atraxa, Praetors' Voice", "is_commander": True}
    ]


def test_parse_commander_header_variants_match():
    # Cabecalho ESTRITO de comandante: "Commander", "Commanders",
    # "Commander (1)", "Commanders (1)" e variacoes de caixa.
    for header in ("Commander", "Commanders", "commander", "COMMANDER",
                   "Commander (1)", "Commanders (1)"):
        items = _parse_decklist(header + "\n1 Test Card")
        assert items and items[0]["is_commander"] is True, header


def test_parse_commander_header_does_not_match_lookalikes():
    # NAO pode marcar comandante em cabecalhos que apenas COMECAM com "Commander"
    # (ex.: "Commander Staples"). Esses caem em 'main'.
    for header in ("Commander Staples", "Commander Tax"):
        items = _parse_decklist(header + "\n1 Some Card")
        assert items and items[0]["is_commander"] is False, header


def test_parse_commander_section_sticks_until_next_header():
    # COMPORTAMENTO REAL (possivel pegadinha): a secao 'commander' permanece ativa
    # para TODAS as linhas de carta seguintes ate o proximo cabecalho. Linha em
    # branco NAO reseta a secao. Logo, num bloco onde o comandante e listado junto
    # com outras cartas sem um novo cabecalho, todas saem com is_commander=True.
    deck = "Commander\n1 Atraxa, Praetors' Voice\n\n1 Sol Ring\n2x Forest"
    items = _parse_decklist(deck)
    assert [it["is_commander"] for it in items] == [True, True, True]
    assert [it["name"] for it in items] == ["Atraxa, Praetors' Voice",
                                            "Sol Ring", "Forest"]


def test_parse_full_decklist_shape():
    # Lista realista: comentario, comandante, mainboard (com novo cabecalho),
    # sideboard ignorado.
    deck = (
        "// Atraxa Superfriends\n"
        "Commander\n"
        "1 Atraxa, Praetors' Voice\n"
        "\n"
        "Deck\n"
        "1 Sol Ring\n"
        "1 Lightning Bolt (M11) 149 *F*\n"
        "Sideboard\n"
        "1 Should Not Appear\n"
    )
    items = _parse_decklist(deck)
    assert items == [
        {"qty": 1, "name": "Atraxa, Praetors' Voice", "is_commander": True},
        {"qty": 1, "name": "Sol Ring", "is_commander": False},
        {"qty": 1, "name": "Lightning Bolt", "is_commander": False},
    ]


def test_parse_returns_int_quantities():
    items = _parse_decklist("4 Island")
    assert isinstance(items[0]["qty"], int)
