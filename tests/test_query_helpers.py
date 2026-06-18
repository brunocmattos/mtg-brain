"""Testes PUROS (sem DB) dos helpers de query em mtg_brain/queries.py.

Rodar:
    PYTHONPATH=. .venv/Scripts/python.exe -m pytest tests/test_query_helpers.py -q

Cobre:
- _limit  : regressao do LIMIT negativo/zero, cap (200), default (60), entradas invalidas.
- _order_by / _SORTS : whitelist de ordenacao (nunca injeta SQL, chave invalida -> default seguro).
- _bucket : type_line -> categoria (land/creature/instant/sorcery/artifact/enchantment/planeswalker/...).

So importa funcoes PURAS; nada que toque no banco.
"""
from mtg_brain.queries import _limit, _order_by, _SORTS, _bucket


# ------------------------------------------------------------------ _limit

def test_limit_none_uses_default():
    # None nao converte -> cai no default (60).
    assert _limit(None) == 60


def test_limit_default_is_60():
    assert _limit(None, default=60) == 60


def test_limit_negative_falls_back_to_default():
    # REGRESSAO do bug do LIMIT negativo: valor <= 0 NAO derruba o Postgres.
    # No codigo atual, negativo cai no `default` (60), depois clamp [1,cap].
    assert _limit(-5) == 60
    assert _limit(-1) == 60
    assert _limit(-999) == 60


def test_limit_zero_falls_back_to_default():
    # Zero tambem e tratado como <= 0 -> vira o default.
    assert _limit(0) == 60


def test_limit_above_cap_clamps_to_cap():
    assert _limit(500) == 200
    assert _limit(201) == 200
    assert _limit(10 ** 9) == 200


def test_limit_at_cap_is_kept():
    assert _limit(200) == 200


def test_limit_normal_value_passes_through():
    assert _limit(40) == 40
    assert _limit(1) == 1
    assert _limit(199) == 199


def test_limit_custom_default_and_cap():
    # Assinatura real: _limit(value, default=60, cap=200) — usada por combos/suggest.
    assert _limit(None, 20, 100) == 20      # None -> default custom
    assert _limit(0, 20, 100) == 20         # zero -> default custom
    assert _limit(-3, 20, 100) == 20        # negativo -> default custom
    assert _limit(500, 20, 100) == 100      # acima do cap custom -> cap
    assert _limit(50, 20, 100) == 50        # dentro -> passa


def test_limit_invalid_string_falls_back_to_default():
    # int("abc") levanta ValueError -> default.
    assert _limit("abc") == 60
    assert _limit("abc", 20, 100) == 20


def test_limit_invalid_type_falls_back_to_default():
    # int([]) levanta TypeError -> default.
    assert _limit([]) == 60
    assert _limit({}) == 60


def test_limit_numeric_string_is_parsed():
    # int("30") == 30 (string numerica converte normalmente).
    assert _limit("30") == 30
    assert _limit("500") == 200       # converte e clampa no cap
    assert _limit("-5") == 60         # converte negativo -> default
    assert _limit("0") == 60          # converte zero -> default


def test_limit_float_is_truncated_then_clamped():
    # int(3.9) == 3 (trunca).
    assert _limit(3.9) == 3
    assert _limit(250.5) == 200       # trunca p/ 250, clampa no cap
    assert _limit(0.5) == 60          # int(0.5)==0 -> <=0 -> default


def test_limit_return_is_always_within_1_and_cap():
    for v in (None, -10, 0, 1, 60, 200, 9999, "abc", [], 3.2):
        out = _limit(v)
        assert 1 <= out <= 200


# ------------------------------------------------------------------ _SORTS / _order_by

def test_sorts_has_exactly_the_expected_whitelist_keys():
    assert set(_SORTS) == {
        "edhrec", "name", "price_asc", "price_desc", "cmc_asc", "cmc_desc",
    }


def test_order_by_returns_whitelisted_clause_for_each_key():
    for key in _SORTS:
        assert _order_by(key) == _SORTS[key]


def test_order_by_default_for_none():
    # None ou "" -> "edhrec" (curto-circuito `sort or "edhrec"`).
    assert _order_by(None) == _SORTS["edhrec"]
    assert _order_by("") == _SORTS["edhrec"]


def test_order_by_invalid_key_falls_back_to_edhrec():
    # Chave fora do whitelist -> clausula segura padrao (edhrec), NUNCA o input.
    assert _order_by("bogus") == _SORTS["edhrec"]
    assert _order_by("RANDOM") == _SORTS["edhrec"]


def test_order_by_never_returns_arbitrary_sql_injection():
    # A entrada maliciosa nunca aparece no retorno — sempre uma das clausulas do whitelist.
    evil = "name; DROP TABLE cards; --"
    out = _order_by(evil)
    assert evil not in out
    assert out in set(_SORTS.values())


def test_order_by_output_is_always_from_whitelist():
    for sort in (None, "", "edhrec", "name", "price_asc", "cmc_desc", "lixo", "1=1"):
        assert _order_by(sort) in set(_SORTS.values())


def test_order_by_is_case_sensitive():
    # Whitelist e case-sensitive: "Name" nao casa -> default.
    assert _order_by("Name") == _SORTS["edhrec"]
    assert _order_by("EDHREC") == _SORTS["edhrec"]


# ------------------------------------------------------------------ _bucket

def test_bucket_land():
    assert _bucket("Land") == "land"
    assert _bucket("Basic Land — Forest") == "land"
    assert _bucket("Legendary Land") == "land"


def test_bucket_creature():
    assert _bucket("Creature — Elf Warrior") == "creature"
    assert _bucket("Legendary Creature — Dragon") == "creature"


def test_bucket_instant():
    assert _bucket("Instant") == "instant"
    assert _bucket("Instant — Arcane") == "instant"


def test_bucket_sorcery():
    assert _bucket("Sorcery") == "sorcery"


def test_bucket_artifact():
    assert _bucket("Artifact") == "artifact"
    assert _bucket("Artifact — Equipment") == "artifact"


def test_bucket_enchantment():
    assert _bucket("Enchantment") == "enchantment"
    assert _bucket("Enchantment — Aura") == "enchantment"


def test_bucket_planeswalker():
    assert _bucket("Planeswalker — Jace") == "planeswalker"
    assert _bucket("Legendary Planeswalker — Liliana") == "planeswalker"


def test_bucket_battle():
    assert _bucket("Battle — Siege") == "battle"


def test_bucket_unknown_returns_outro():
    assert _bucket("Tribal") == "outro"
    assert _bucket("Dungeon") == "outro"
    assert _bucket("Hero") == "outro"


def test_bucket_none_and_empty_return_outro():
    assert _bucket(None) == "outro"
    assert _bucket("") == "outro"


def test_bucket_is_case_insensitive():
    assert _bucket("CREATURE") == "creature"
    assert _bucket("creature — goblin") == "creature"
    assert _bucket("LaNd") == "land"


def test_bucket_artifact_creature_prefers_creature_by_order():
    # Ordem real de checagem: land, creature, planeswalker, instant, sorcery, artifact, ...
    # "Artifact Creature" contem ambos; "creature" vem ANTES de "artifact" -> "creature".
    assert _bucket("Artifact Creature — Golem") == "creature"


def test_bucket_enchantment_creature_prefers_creature():
    # "creature" precede "enchantment" na lista -> bucket creature.
    assert _bucket("Enchantment Creature — God") == "creature"


def test_bucket_land_creature_prefers_land():
    # "land" e o primeiro da lista; uma "Creature Land" cai em land.
    assert _bucket("Land Creature — Elemental") == "land"
