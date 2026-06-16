"""Configuração central — lida de variáveis de ambiente (.env)."""
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://mtg:mtg@localhost:5432/mtg")
DATA_DIR = os.getenv("DATA_DIR", "data")

# Scryfall pede que clientes se identifiquem e mantenham < 10 req/s.
USER_AGENT = os.getenv("USER_AGENT", "mtg-brain/0.1 (personal project)")
SCRYFALL_API = "https://api.scryfall.com"
SCRYFALL_REQUEST_DELAY = float(os.getenv("SCRYFALL_REQUEST_DELAY", "0.1"))

# Commander Spellbook (combos)
CSB_API = os.getenv("CSB_API", "https://backend.commanderspellbook.com")

# Comprehensive Rules: o link do .txt muda a cada coleção.
# Pegue o atual em https://magic.wizards.com/en/rules e ponha em CR_TXT_URL.
CR_RULES_PAGE = "https://magic.wizards.com/en/rules"
CR_TXT_URL = os.getenv("CR_TXT_URL", "")

# Fase 3 — cérebro (LLM via API OpenAI-compatível). Padrão: Ollama local ($0, ilimitado).
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:11434/v1")
LLM_MODEL = os.getenv("LLM_MODEL", "qwen2.5:7b")
LLM_API_KEY = os.getenv("LLM_API_KEY", "ollama")
