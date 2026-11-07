"""Testes puros (sem DB) de _card_row: o que vai pra tabela cards a partir do bulk."""
from mtg_brain.ingest.scryfall import _card_row

DFC = {
    "id": "x", "name": "Bonecrusher Giant // Stomp", "layout": "adventure",
    "mana_cost": "{2}{R} // {1}{R}",
    "card_faces": [
        {"name": "Bonecrusher Giant", "mana_cost": "{2}{R}", "power": "4", "toughness": "3",
         "oracle_text": "Whenever this creature becomes the target of a spell, it deals 2 damage."},
        {"name": "Stomp", "mana_cost": "{1}{R}",
         "oracle_text": "Damage can't be prevented this turn. Stomp deals 2 damage to any target."},
    ],
}

TRANSFORM = {
    "id": "y", "name": "Delver of Secrets // Insectile Aberration", "layout": "transform",
    "card_faces": [
        {"mana_cost": "{U}", "power": "1", "toughness": "1", "oracle_text": "Transform it."},
        {"mana_cost": "", "power": "3", "toughness": "2", "oracle_text": "Flying"},
    ],
}


def test_multiface_text_joins_all_faces():
    text = _card_row(DFC)["oracle_text"]
    assert "becomes the target" in text and "Stomp deals 2 damage" in text


def test_multiface_keeps_top_level_cost_when_present():
    assert _card_row(DFC)["mana_cost"] == "{2}{R} // {1}{R}"


def test_transform_inherits_front_face_cost_and_body():
    row = _card_row(TRANSFORM)
    assert row["mana_cost"] == "{U}"
    assert (row["power"], row["toughness"]) == ("1", "1")
    assert row["oracle_text"] == "Transform it.\n//\nFlying"


def test_normal_card_untouched():
    row = _card_row({"id": "z", "name": "Sol Ring", "layout": "normal",
                     "mana_cost": "{1}", "oracle_text": "{T}: Add {C}{C}."})
    assert (row["mana_cost"], row["oracle_text"]) == ("{1}", "{T}: Add {C}{C}.")


def test_non_card_layouts_are_skipped():
    # token "Ornithopter" colidia por nome com a carta real e entrava no deck no lugar dela
    for layout in ("token", "double_faced_token", "emblem", "art_series"):
        assert _card_row({"id": "t", "name": "Ornithopter", "layout": layout}) is None


def test_iter_bulk_reads_jsonl_gz(tmp_path):
    import gzip
    import json

    from mtg_brain.ingest.scryfall import _iter_bulk
    p = tmp_path / "b.jsonl.gz"
    with gzip.open(p, "wt", encoding="utf-8") as f:
        f.write(json.dumps({"name": "Séance", "cmc": 4.0}) + "\n\n")
        f.write(json.dumps({"name": "Sol Ring"}) + "\n")
    assert [c["name"] for c in _iter_bulk(p)] == ["Séance", "Sol Ring"]
