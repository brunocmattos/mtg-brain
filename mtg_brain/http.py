"""Cliente HTTP: sessão com User-Agent, retry/backoff, rate-limit e download em streaming."""
import os
import time

import requests
from tqdm import tqdm

from . import config

_session = None


def session():
    global _session
    if _session is None:
        s = requests.Session()
        s.headers.update({"User-Agent": config.USER_AGENT, "Accept": "application/json"})
        _session = s
    return _session


def get_json(url, params=None, delay=None):
    """GET com retry em 429/5xx (honra Retry-After) e atraso entre chamadas."""
    delay = config.SCRYFALL_REQUEST_DELAY if delay is None else delay
    last = None
    for attempt in range(8):
        resp = session().get(url, params=params, timeout=60)
        last = resp
        if resp.status_code == 429 or resp.status_code >= 500:
            retry_after = resp.headers.get("Retry-After", "")
            wait = float(retry_after) if retry_after.isdigit() else min(2 ** attempt, 30)
            time.sleep(wait)
            continue
        resp.raise_for_status()
        if delay:
            time.sleep(delay)
        return resp.json()
    last.raise_for_status()


def get_text(url):
    resp = session().get(url, timeout=120)
    resp.raise_for_status()
    return resp.content


def download(url, dest):
    """Baixa um arquivo grande em streaming, com barra de progresso."""
    os.makedirs(os.path.dirname(dest) or ".", exist_ok=True)
    with session().get(url, stream=True, timeout=600) as resp:
        resp.raise_for_status()
        total = int(resp.headers.get("Content-Length", 0))
        with open(dest, "wb") as f, tqdm(
            total=total, unit="B", unit_scale=True, desc=os.path.basename(dest)
        ) as bar:
            for chunk in resp.iter_content(chunk_size=1 << 16):
                f.write(chunk)
                bar.update(len(chunk))
    return dest
