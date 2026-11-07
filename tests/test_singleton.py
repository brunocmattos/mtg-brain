"""Commander é singleton: só básicos e cartas que dizem 'any number of cards named' repetem."""
import pytest
from pydantic import ValidationError

from mtg_brain.api.app import DeckCardBody, PrintingBody
from mtg_brain.queries import _allows_multiple


def test_basics_and_any_number_cards_repeat():
    assert _allows_multiple("Swamp", "({T}: Add {B}.)") is True
    assert _allows_multiple("Relentless Rats", "A deck can have any number of cards "
                            "named Relentless Rats.") is True
    assert _allows_multiple("Seven Dwarves", "A deck can have up to seven cards named "
                            "Seven Dwarves.") is True


def test_regular_card_is_singleton():
    assert _allows_multiple("Sol Ring", "{T}: Add {C}{C}.") is False
    assert _allows_multiple("Sol Ring", None) is False


def test_qty_must_be_positive():
    with pytest.raises(ValidationError):
        DeckCardBody(card_name="Sol Ring", qty=0)
    with pytest.raises(ValidationError):
        DeckCardBody(card_name="Sol Ring", qty=-3)


def test_printing_rejects_non_numeric_price_and_foreign_image():
    ok = {"scryfall_id": "a", "set": "c21", "set_name": "C21", "collector_number": "263",
          "image": "https://cards.scryfall.io/normal/front/a.jpg", "art_crop": None,
          "usd": "1.33", "eur": None, "tix": None}
    PrintingBody(card_name="Sol Ring", printing=ok)
    with pytest.raises(ValidationError):  # quebrava o ::numeric e derrubava o deck com 500
        PrintingBody(card_name="Sol Ring", printing={**ok, "usd": "abc"})
    with pytest.raises(ValidationError):
        PrintingBody(card_name="Sol Ring", printing={**ok, "image": "https://evil.example/x.jpg"})
