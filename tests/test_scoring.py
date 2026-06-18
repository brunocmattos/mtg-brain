"""Testes PYTEST puros (sem DB) para as funcoes de scoring/heuristica em
mtg_brain/queries.py. Cobrem APENAS funcoes puras (nada de _rows/_write/DB).

Grupo: scoring
Alvos: _band, _band_soft_high, _curve_score, _power_rank, _deck_gaps,
       _deck_bracket, _flag
"""

from mtg_brain.queries import (
    _band,
    _band_soft_high,
    _curve_score,
    _power_rank,
    _deck_gaps,
    _deck_bracket,
    _flag,
)


# ---------------------------------------------------------------------------
# _band(v, lo, hi, hard_lo, hard_hi)
# 10 dentro de [lo,hi]; decai linear ate 0 nos extremos hard_lo/hard_hi.
# ---------------------------------------------------------------------------

def test_band_plateau_dentro_da_faixa():
    # qualquer valor em [lo, hi] -> 10
    assert _band(35, 35, 39, 28, 45) == 10.0
    assert _band(37, 35, 39, 28, 45) == 10.0
    assert _band(39, 35, 39, 28, 45) == 10.0


def test_band_decai_no_lado_baixo():
    # entre hard_lo e lo: valor intermediario fica entre 0 e 10
    s = _band(31, 35, 39, 28, 45)  # (31-28)/(35-28)=3/7 -> ~4.3
    assert 0.0 < s < 10.0
    # ponto medio exato
    assert _band(31.5, 35, 39, 28, 45) == round(10.0 * (31.5 - 28) / (35 - 28), 1)


def test_band_decai_no_lado_alto():
    s = _band(42, 35, 39, 28, 45)  # (45-42)/(45-39)=3/6 -> 5.0
    assert s == 5.0


def test_band_zero_fora_dos_hard_limits():
    # no hard_lo exato -> 0; abaixo dele tambem 0 (max(0.0, ...))
    assert _band(28, 35, 39, 28, 45) == 0.0
    assert _band(20, 35, 39, 28, 45) == 0.0
    # no hard_hi exato -> 0; acima dele tambem 0
    assert _band(45, 35, 39, 28, 45) == 0.0
    assert _band(60, 35, 39, 28, 45) == 0.0


# ---------------------------------------------------------------------------
# _band_soft_high(v, lo, hi, hard_lo, floor=8.0, slope=0.25)
# Lado baixo decai como _band; plateau 10 em [lo,hi]; lado ALTO nao despenca
# (piso = floor). REGRESSAO: valor bem acima de hi deve ficar >= floor, nunca ~0.
# ---------------------------------------------------------------------------

def test_band_soft_high_plateau():
    assert _band_soft_high(9, 9, 14, 2) == 10.0
    assert _band_soft_high(12, 9, 14, 2) == 10.0
    assert _band_soft_high(14, 9, 14, 2) == 10.0


def test_band_soft_high_lado_baixo_decai():
    # abaixo de lo cai (delega pro _band com hard_hi = hi+1)
    s = _band_soft_high(4, 9, 14, 2)
    assert 0.0 < s < 10.0
    # bem abaixo de hard_lo -> 0
    assert _band_soft_high(1, 9, 14, 2) == 0.0


def test_band_soft_high_lado_alto_nao_despenca_piso():
    # logo acima de hi: retorno decrescente leve, ainda alto
    assert _band_soft_high(15, 9, 14, 2) == 9.8  # 10 - (15-14)*0.25
    # bem acima de hi NUNCA vai a ~0: piso 8.0 (regressao do bug)
    s_alto = _band_soft_high(40, 9, 14, 2)
    assert s_alto >= 8.0
    s_extremo = _band_soft_high(1000, 9, 14, 2)
    assert s_extremo == 8.0  # cravado no piso


def test_band_soft_high_regressao_draw20_interaction17():
    # caso exato do bug: draw=20 (faixa 8..13) e interaction=17 (faixa 8..12)
    # nao podem zerar -- antes davam ~0, agora ficam acima do piso.
    s_draw = _band_soft_high(20, 8, 13, 2)   # 10 - 7*0.25 = 8.25 -> round(_,1)=8.2
    s_inter = _band_soft_high(17, 8, 12, 2)  # 10 - 5*0.25 = 8.75 -> round(_,1)=8.8
    # round(8.25, 1) == 8.2 (arredondamento "banker's" do Python)
    assert s_draw == round(10.0 - (20 - 13) * 0.25, 1)
    assert s_inter == round(10.0 - (17 - 12) * 0.25, 1)
    assert s_draw >= 8.0 and s_inter >= 8.0


# ---------------------------------------------------------------------------
# _curve_score(avg): <=2.8 -> 10, >=4.5 -> 0, interpolado no meio
# ---------------------------------------------------------------------------

def test_curve_score_baixa_e_alta():
    assert _curve_score(2.8) == 10.0
    assert _curve_score(2.0) == 10.0
    assert _curve_score(4.5) == 0.0
    assert _curve_score(5.0) == 0.0


def test_curve_score_meio_interpolado():
    s = _curve_score(3.65)  # ponto medio aprox
    assert s == round(10.0 * (4.5 - 3.65) / (4.5 - 2.8), 1)
    assert 0.0 < s < 10.0
    # monotonicidade: curva mais baixa pontua mais
    assert _curve_score(3.0) > _curve_score(4.0)


# ---------------------------------------------------------------------------
# _flag(value, low, high=None) -> "baixo" / "alto" / "ok"
# ---------------------------------------------------------------------------

def test_flag_baixo_alto_ok():
    assert _flag(3, 5) == "baixo"
    assert _flag(5, 5) == "ok"          # nao eh < low
    assert _flag(7, 5) == "ok"          # sem high definido
    assert _flag(10, 5, 8) == "alto"
    assert _flag(8, 5, 8) == "ok"       # nao eh > high
    assert _flag(6, 5, 8) == "ok"


# ---------------------------------------------------------------------------
# _power_rank(*, lands, ramp, draw, interaction, avg_cmc, combos, gc, tutors,
#             complete) -> dict com score/label/axes/verdict/note
# (keyword-only)
# ---------------------------------------------------------------------------

def _deck_forte(**over):
    base = dict(lands=37, ramp=12, draw=12, interaction=10, avg_cmc=2.7,
                combos=4, gc=5, tutors=6, complete=True)
    base.update(over)
    return base


def test_power_rank_formato_de_retorno():
    r = _power_rank(**_deck_forte())
    assert set(["score", "label", "axes", "verdict", "note"]).issubset(r.keys())
    assert isinstance(r["score"], int)
    assert isinstance(r["axes"], list) and len(r["axes"]) == 3
    keys = {a["key"] for a in r["axes"]}
    assert keys == {"consistencia", "interacao", "poder"}
    for a in r["axes"]:
        assert 0.0 <= a["score"] <= 10.0


def test_power_rank_label_altissimo():
    r = _power_rank(**_deck_forte())
    assert r["score"] >= 85
    assert r["label"] == "Altíssimo poder"


def test_power_rank_label_por_faixa():
    # >=70 'Forte'
    r_forte = _power_rank(lands=37, ramp=10, draw=10, interaction=9, avg_cmc=3.0,
                          combos=1, gc=2, tutors=2, complete=True)
    assert 70 <= r_forte["score"] < 85
    assert r_forte["label"] == "Forte"

    # 'Casual / em construção' (faixa mais baixa) -- deck fraco completo
    r_casual = _power_rank(lands=30, ramp=0, draw=0, interaction=0, avg_cmc=5.0,
                           combos=0, gc=0, tutors=0, complete=True)
    assert r_casual["score"] < 40
    assert r_casual["label"] == "Casual / em construção"


def test_power_rank_deck_incompleto_capa_em_55():
    # mesmo deck "forte", porem incompleto: score nao pode passar de 55
    r = _power_rank(**_deck_forte(complete=False))
    assert r["score"] <= 55
    assert r["note"] is not None
    # rotulo no maximo "Sólido" (>=55), nunca "Forte"/"Altíssimo"
    assert r["label"] in ("Sólido", "Casual+", "Casual / em construção")


def test_power_rank_regressao_interaction17_draw20_nao_zeram_eixos():
    # REGRESSAO: muita interacao/compra nao deve zerar os eixos correspondentes.
    r = _power_rank(lands=37, ramp=12, draw=20, interaction=17, avg_cmc=2.7,
                    combos=2, gc=3, tutors=4, complete=True)
    eixo = {a["key"]: a["score"] for a in r["axes"]}
    # interacao usa _band_soft_high(17, 8, 12, 2) = 8.75 -> nao zera
    assert eixo["interacao"] >= 8.0
    # consistencia agrega draw (20) via soft_high; com lands/ramp/curve bons
    # tem que ficar bem acima de 0
    assert eixo["consistencia"] > 5.0
    assert r["score"] > 0


# ---------------------------------------------------------------------------
# _deck_gaps(*, lands, ramp, draw, interaction, wipes, counters,
#            instant_interaction, avg_cmc, identity, complete) -> [ {severity,text} ]
# (keyword-only)
# ---------------------------------------------------------------------------

def _deck_saudavel(**over):
    base = dict(lands=37, ramp=10, draw=10, interaction=9, wipes=3, counters=3,
                instant_interaction=6, avg_cmc=3.0, identity="WUB", complete=True)
    base.update(over)
    return base


def test_deck_gaps_ok_quando_nada():
    gaps = _deck_gaps(**_deck_saudavel())
    assert len(gaps) == 1
    assert gaps[0]["severity"] == "ok"


def test_deck_gaps_instant_baixo_gera_alto():
    gaps = _deck_gaps(**_deck_saudavel(instant_interaction=2))
    sevs = [g["severity"] for g in gaps]
    assert "alto" in sevs
    # o gap de instant aparece e menciona velocidade de instante
    assert any("instante" in g["text"].lower() for g in gaps)


def test_deck_gaps_wipes_baixo_gera_medio():
    gaps = _deck_gaps(**_deck_saudavel(wipes=1))
    assert any(g["severity"] == "medio" and "wipe" in g["text"].lower() for g in gaps)


def test_deck_gaps_incompleto_e_ordenacao():
    gaps = _deck_gaps(**_deck_saudavel(complete=False, instant_interaction=1,
                                       interaction=3, wipes=0, lands=30))
    # deck incompleto entra como gap "alto"
    assert any("incompleto" in g["text"].lower() for g in gaps)
    # resultado vem ordenado por severidade: alto antes de medio antes de baixo/ok
    ordem = {"alto": 0, "medio": 1, "baixo": 2, "ok": 3}
    vals = [ordem[g["severity"]] for g in gaps]
    assert vals == sorted(vals)


# ---------------------------------------------------------------------------
# _deck_bracket(gc, two_card_combos, mld, extra_turns, total_combos) -> dict
# level 4 se >3 gc / MLD / turnos extras; level 3 se ha combos/gc; level 2 senao
# (gc eh uma colecao -- usa len(gc))
# ---------------------------------------------------------------------------

def test_deck_bracket_level2_nada():
    r = _deck_bracket(gc=[], two_card_combos=0, mld=False, extra_turns=False,
                      total_combos=0)
    assert r["level"] == 2
    assert r["note"] is None


def test_deck_bracket_level3_combos_ou_gc():
    # ha game changers (<=3) -> level 3
    r_gc = _deck_bracket(gc=["Rhystic Study", "Smothering Tithe"],
                         two_card_combos=0, mld=False, extra_turns=False,
                         total_combos=0)
    assert r_gc["level"] == 3
    # ha combos no total -> level 3
    r_combo = _deck_bracket(gc=[], two_card_combos=1, mld=False, extra_turns=False,
                            total_combos=2)
    assert r_combo["level"] == 3
    # combo de 2 cartas gera uma nota de aviso
    assert r_combo["note"] is not None


def test_deck_bracket_level4_muitos_gc():
    r = _deck_bracket(gc=["Mana Crypt", "Mana Vault", "Jeweled Lotus", "Chrome Mox"],
                      two_card_combos=0, mld=False, extra_turns=False, total_combos=0)
    assert r["level"] == 4
    assert "game changers" in r["reason"].lower()


def test_deck_bracket_level4_mld_e_extra_turns():
    r_mld = _deck_bracket(gc=[], two_card_combos=0, mld=True, extra_turns=False,
                          total_combos=0)
    assert r_mld["level"] == 4
    r_extra = _deck_bracket(gc=[], two_card_combos=0, mld=False, extra_turns=True,
                            total_combos=0)
    assert r_extra["level"] == 4
