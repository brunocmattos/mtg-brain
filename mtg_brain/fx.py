"""Câmbio USD→BRL para mostrar o preço do deck em reais.

Busca a cotação na AwesomeAPI (grátis, sem chave), cacheia em memória por ~6h e
cai num valor de reserva se a rede falhar. Não trava o app: qualquer erro vira fallback.
"""
import logging
import time

from . import http

log = logging.getLogger(__name__)

_URL = "https://economia.awesomeapi.com.br/last/USD-BRL"
_TTL = 6 * 3600  # 6 horas
_FALLBACK = 5.40  # usado só se nunca conseguimos cotar
_cache = {"rate": None, "ts": 0.0}


def usd_to_brl():
    """Devolve (rate, source). source: 'cache' | 'awesomeapi' | 'fallback'."""
    now = time.time()
    if _cache["rate"] and now - _cache["ts"] < _TTL:
        return _cache["rate"], "cache"
    try:
        r = http.session().get(_URL, timeout=5)
        r.raise_for_status()
        rate = float(r.json()["USDBRL"]["bid"])
        _cache.update(rate=rate, ts=now)
        return rate, "awesomeapi"
    except Exception:  # noqa: BLE001 — câmbio nunca pode derrubar a resposta
        log.warning("Falha ao cotar USD-BRL; usando %s", _cache["rate"] or _FALLBACK)
        return (_cache["rate"] or _FALLBACK), "fallback"
