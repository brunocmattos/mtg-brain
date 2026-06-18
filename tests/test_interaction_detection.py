"""Testes PYTEST puros (sem DB) das heuristicas de deteccao em queries.py.

Rodar:
    PYTHONPATH=. .venv/Scripts/python.exe -m pytest tests/test_interaction_detection.py -q

Cobre as funcoes puras de classificacao de cartas/combos:
_is_wipe, _is_interaction, _is_mass_removal, _is_ramp, _is_draw, _is_tutor,
_is_counter, _is_instant_speed, _is_mld, _is_extra_turn, _is_win_combo.

Todos os textos sao oraculo REAL (Scryfall). NENHUMA funcao aqui toca no banco.
"""
from mtg_brain.queries import (
    _is_counter,
    _is_draw,
    _is_extra_turn,
    _is_instant_speed,
    _is_interaction,
    _is_mass_removal,
    _is_mld,
    _is_ramp,
    _is_tutor,
    _is_win_combo,
    _is_wipe,
)

# ---------------------------------------------------------------- textos reais
# Board wipes que DEVEM contar como wipe.
TOXIC_DELUGE = ("As an additional cost to cast this spell, pay X life.\n"
                "All creatures get -X/-X until end of turn.")
DAMN = ('Destroy target creature. A creature destroyed this way can\'t be regenerated.\n'
        'Overload {2}{W}{W} (You may cast this spell for its overload cost. '
        'If you do, change "target" in its text to "each.")')
MEATHOOK_MASSACRE = (
    "As an additional cost to cast this spell, pay X life.\n"
    "When The Meathook Massacre enters the battlefield, each creature gets -X/-X "
    "until end of turn.\n"
    "Whenever a creature an opponent controls dies, that player loses 1 life.\n"
    "Whenever a creature you control dies, you gain 1 life."
)
KINDRED_DOMINANCE = "Choose a creature type. Destroy all creatures that aren't of the chosen type."
LANGUISH = "All creatures get -4/-4 until end of turn."
IN_GARRUKS_WAKE = "Destroy all creatures you don't control."
WRATH_OF_GOD = "Destroy all creatures. They can't be regenerated."

# NAO sao wipes.
DISFIGURE = "Target creature gets -2/-2 until end of turn."  # debuff de alvo unico
DICTATE_EREBOS = ("Flash\nWhenever a creature you control dies, each opponent "
                  "sacrifices a creature of their choice.")  # edict
GRAVE_PACT = ("Whenever a creature you control dies, each other player "
              "sacrifices a creature of their choice.")  # edict
SAC_OUTLET = "Sacrifice a creature: Add {C}{C}."  # outlet de sacrificio
SPOT_REMOVAL = "Destroy target creature."  # remocao pontual
PUMP = "Creatures you control get +2/+2 until end of turn."  # buff, nao debuff

COUNTERSPELL = "Counter target spell."


# ============================================================= _is_wipe (True)
def test_wipe_toxic_deluge_mass_minus_x():
    # "All creatures get -X/-X" -> debuff coletivo (nao diz destroy all).
    assert _is_wipe(TOXIC_DELUGE) is True


def test_wipe_damn_overload_change_target_to_each():
    # Overload que troca "target" por "each" + "destroy target".
    assert _is_wipe(DAMN) is True


def test_wipe_meathook_each_creature_gets_minus_x():
    assert _is_wipe(MEATHOOK_MASSACRE) is True


def test_wipe_kindred_dominance_destroy_all():
    assert _is_wipe(KINDRED_DOMINANCE) is True


def test_wipe_languish_mass_minus_x():
    assert _is_wipe(LANGUISH) is True


def test_wipe_in_garruks_wake_destroy_all():
    assert _is_wipe(IN_GARRUKS_WAKE) is True


def test_wipe_wrath_of_god_destroy_all():
    assert _is_wipe(WRATH_OF_GOD) is True


# ============================================================ _is_wipe (False)
def test_wipe_false_single_target_debuff():
    assert _is_wipe(DISFIGURE) is False


def test_wipe_false_edict_dictate_of_erebos():
    assert _is_wipe(DICTATE_EREBOS) is False


def test_wipe_false_edict_grave_pact():
    assert _is_wipe(GRAVE_PACT) is False


def test_wipe_false_sac_outlet():
    assert _is_wipe(SAC_OUTLET) is False


def test_wipe_false_spot_removal():
    assert _is_wipe(SPOT_REMOVAL) is False


def test_wipe_false_pump_plus_x():
    assert _is_wipe(PUMP) is False


def test_wipe_false_on_empty_and_none():
    assert _is_wipe("") is False
    assert _is_wipe(None) is False


# ========================================================= _is_mass_removal
# Recebe o texto JA em minusculas (vem de _is_wipe/_is_interaction).
def test_mass_removal_creatures_get_minus():
    assert _is_mass_removal("all creatures get -x/-x until end of turn.") is True


def test_mass_removal_each_creature_gets_minus():
    assert _is_mass_removal("each creature gets -x/-x until end of turn.") is True


def test_mass_removal_languish():
    assert _is_mass_removal("all creatures get -4/-4 until end of turn.") is True


def test_mass_removal_overload_with_target():
    assert _is_mass_removal(DAMN.lower()) is True


def test_mass_removal_false_single_target():
    assert _is_mass_removal("target creature gets -2/-2 until end of turn.") is False


def test_mass_removal_false_pump():
    assert _is_mass_removal("creatures you control get +2/+2 until end of turn.") is False


# ========================================================= _is_interaction
def test_interaction_destroy_target():
    assert _is_interaction(SPOT_REMOVAL) is True


def test_interaction_counter_target():
    assert _is_interaction(COUNTERSPELL) is True


def test_interaction_mass_wipe_toxic_deluge():
    # Wipes em massa tambem contam como interacao (via _is_mass_removal).
    assert _is_interaction(TOXIC_DELUGE) is True


def test_interaction_damn():
    assert _is_interaction(DAMN) is True


def test_interaction_kindred_dominance_destroy_all():
    assert _is_interaction(KINDRED_DOMINANCE) is True


def test_interaction_return_target():
    assert _is_interaction("Return target creature to its owner's hand.") is True


def test_interaction_exile_target():
    assert _is_interaction("Exile target creature.") is True


def test_interaction_false_edict_dictate():
    # Edict ("each opponent sacrifices") nao casa as chaves de interacao.
    assert _is_interaction(DICTATE_EREBOS) is False


def test_interaction_false_pump():
    assert _is_interaction(PUMP) is False


def test_interaction_false_on_none():
    assert _is_interaction(None) is False


# ================================================================ _is_ramp
# Assinatura POSICIONAL: _is_ramp(bucket, text).
def test_ramp_add_brace_mana():
    assert _is_ramp("artifact", "{T}: Add {C}.") is True


def test_ramp_add_one_mana_phrase():
    assert _is_ramp("creature", "Add one mana of any color.") is True


def test_ramp_search_for_land():
    assert _is_ramp("sorcery", "Search your library for a basic land card, "
                                "put it onto the battlefield, then shuffle.") is True


def test_ramp_false_on_land_bucket():
    # Terreno que produz mana NAO conta como ramp (ele proprio e a manabase).
    assert _is_ramp("land", "{T}: Add {G}.") is False


def test_ramp_false_plain_creature():
    assert _is_ramp("creature", "Draw a card.") is False


def test_ramp_false_search_non_land():
    # Tutor generico (busca carta, nao terreno) nao e ramp.
    assert _is_ramp("sorcery", "Search your library for a card, then shuffle.") is False


# ================================================================ _is_draw
def test_draw_a_card():
    assert _is_draw("Draw a card.") is True


def test_draw_two_cards():
    assert _is_draw("Draw two cards.") is True


def test_draw_three_cards():
    assert _is_draw("Draw three cards, then discard a card.") is True


def test_draw_each_player_draws_a_card():
    # "draws a card" tambem casa o regex (draws? \\w+ cards?).
    assert _is_draw("Each player draws a card.") is True


def test_draw_x_cards():
    assert _is_draw("Draw X cards.") is True


def test_draw_false_no_draw():
    assert _is_draw("Destroy target creature.") is False


def test_draw_false_on_none():
    assert _is_draw(None) is False


def test_draw_up_to_two_cards_is_false_known_gap():
    # COMPORTAMENTO REAL: o regex `draws? \\w+ cards?` so admite UMA palavra entre
    # "draw" e "cards"; "up to two" tem tres -> nao casa. Possivel sub-contagem
    # (ver behavior_notes). Travado para nao mascarar regressao.
    assert _is_draw("Draw up to two cards.") is False


# =============================================================== _is_tutor
def test_tutor_generic_search_for_a_card():
    assert _is_tutor("Search your library for a card, then shuffle and put that "
                     "card on top.") is True


def test_tutor_false_search_for_land():
    # Busca-terreno e ramp, nao tutor generico.
    assert _is_tutor("Search your library for a basic land card.") is False


def test_tutor_false_search_for_creature():
    # So casa a frase exata "search your library for a card".
    assert _is_tutor("Search your library for a creature card.") is False


def test_tutor_false_on_none():
    assert _is_tutor(None) is False


# ============================================================== _is_counter
def test_counter_target_spell():
    assert _is_counter(COUNTERSPELL) is True


def test_counter_target_creature_spell():
    assert _is_counter("Counter target creature spell.") is True


def test_counter_false_spot_removal():
    assert _is_counter(SPOT_REMOVAL) is False


def test_counter_false_on_none():
    assert _is_counter(None) is False


# ========================================================== _is_instant_speed
# Assinatura POSICIONAL: _is_instant_speed(type_line, text).
def test_instant_speed_by_type_line():
    assert _is_instant_speed("Instant", "Counter target spell.") is True


def test_instant_speed_by_flash_keyword():
    assert _is_instant_speed("Enchantment", "Flash\nWhenever a creature dies...") is True


def test_instant_speed_false_sorcery():
    assert _is_instant_speed("Sorcery", "Destroy all creatures.") is False


def test_instant_speed_false_creature_no_flash():
    assert _is_instant_speed("Creature - Human Wizard", "Draw a card.") is False


def test_instant_speed_handles_none_args():
    assert _is_instant_speed(None, None) is False


# ================================================================= _is_mld
# Assinatura POSICIONAL: _is_mld(name, text).
def test_mld_by_name_in_set():
    # Armageddon esta na lista MASS_LAND_DENIAL (mesmo sem texto descritivo).
    assert _is_mld("Armageddon", "") is True


def test_mld_by_destroy_all_lands_text():
    assert _is_mld("Carta Qualquer", "Destroy all lands.") is True


def test_mld_false_creature_wipe():
    assert _is_mld("Wrath of God", "Destroy all creatures. They can't be regenerated.") is False


def test_mld_false_on_none_text():
    assert _is_mld("Lightning Bolt", None) is False


# ============================================================ _is_extra_turn
def test_extra_turn_true():
    assert _is_extra_turn("Take an extra turn after this one.") is True


def test_extra_turn_false():
    assert _is_extra_turn("Draw a card.") is False


def test_extra_turn_false_on_none():
    assert _is_extra_turn(None) is False


# ============================================================= _is_win_combo
# Combo = dict com "card_names" (lista) e "results" (lista de strings).
def test_win_combo_two_cards_infinite():
    combo = {"card_names": ["Card A", "Card B"], "results": ["Infinite mana"]}
    assert _is_win_combo(combo) is True


def test_win_combo_two_cards_wins_the_game():
    combo = {"card_names": ["Card A", "Card B"], "results": ["Target player wins the game."]}
    assert _is_win_combo(combo) is True


def test_win_combo_two_cards_loses_the_game():
    combo = {"card_names": ["Card A", "Card B"], "results": ["Each opponent loses the game."]}
    assert _is_win_combo(combo) is True


def test_win_combo_false_three_cards_even_if_infinite():
    # Exige EXATAMENTE 2 cartas.
    combo = {"card_names": ["A", "B", "C"], "results": ["Infinite damage"]}
    assert _is_win_combo(combo) is False


def test_win_combo_false_two_cards_no_win_keyword():
    combo = {"card_names": ["A", "B"], "results": ["Draw two cards each turn"]}
    assert _is_win_combo(combo) is False


def test_win_combo_false_two_cards_empty_results():
    combo = {"card_names": ["A", "B"], "results": []}
    assert _is_win_combo(combo) is False


def test_win_combo_false_two_cards_missing_results_key():
    # results ausente -> .get(...) or [] -> sem palavra-chave -> False (sem KeyError).
    combo = {"card_names": ["A", "B"]}
    assert _is_win_combo(combo) is False
