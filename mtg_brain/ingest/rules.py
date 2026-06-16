"""Ingestão das Comprehensive Rules (mecânicas/como jogar) — o .txt oficial da WotC.

O link do arquivo muda a cada coleção. Defina CR_TXT_URL no .env (pegue em
https://magic.wizards.com/en/rules). Sem ele, tentamos descobrir o link na página.
"""
import os
import re

from .. import config, db, http

# Casa "100", "100.1" e "100.1a" no começo da linha, com ou sem ponto final.
RULE_RE = re.compile(r"^(\d{3}(?:\.\d+)?[a-z]?)\.?\s+(.+)$")

RULE_UPSERT = """
INSERT INTO rules (rule_number, section, text, examples)
VALUES (%(rule_number)s, %(section)s, %(text)s, %(examples)s)
ON CONFLICT (rule_number) DO UPDATE SET
    section=EXCLUDED.section, text=EXCLUDED.text, examples=EXCLUDED.examples;
"""


def _discover_url():
    """Best-effort: procura um link .txt na página de regras."""
    html = http.get_text(config.CR_RULES_PAGE).decode("utf-8", errors="replace")
    m = re.findall(r"https?://[^\s\"'>]+?\.txt", html)
    if m:
        return m[0]
    raise RuntimeError(
        "Não achei o link do .txt automaticamente. Pegue em "
        f"{config.CR_RULES_PAGE} e ponha em CR_TXT_URL no .env."
    )


def _parse(text):
    """Quebra o texto das regras em (rule_number, section, text, examples)."""
    rules, current = {}, None
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith("Example:") and current is not None:
            rules[current]["examples"].append(line[len("Example:"):].strip())
            continue
        m = RULE_RE.match(line)
        if m:
            number, body = m.group(1), m.group(2).strip()
            current = number
            rules[number] = {
                "rule_number": number,
                "section": number[:3],
                "text": body,
                "examples": [],
            }
    return list(rules.values())


def ingest_rules():
    url = config.CR_TXT_URL or _discover_url()
    dest = os.path.join(config.DATA_DIR, "comp_rules.txt")
    http.download(url, dest)
    with open(dest, "rb") as f:
        text = f.read().decode("utf-8", errors="replace")
    rows = _parse(text)
    if not rows:
        raise RuntimeError("nenhuma regra reconhecida — o formato do .txt pode ter mudado")
    with db.connect() as conn:
        return db.upsert_batch(conn, RULE_UPSERT, rows)
