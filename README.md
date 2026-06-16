# mtg-brain

Pipeline de ingestão + banco Postgres com **tudo de Magic: The Gathering**: cartas e
todos os atributos, comandantes, legalidade, preços, rulings, palavras-chave/mecânicas,
as regras oficiais (Comprehensive Rules) e combos do Commander Spellbook.

É a **fundação** (Fase 1 + 2). Em cima dela dá pra empilhar depois um assistente (RAG) e
um otimizador de deck (Fase 3).

## Stack
- **Python 3.11+** (testado no 3.14) — ingestão
- **PostgreSQL 17** em Docker — armazenamento
- Fontes: [Scryfall](https://scryfall.com/docs/api), [Commander Spellbook](https://commanderspellbook.com), Comprehensive Rules da WotC

## Arquitetura
```
ingest (ETL)  ->  Postgres  ->  query / (Fase 3: RAG, otimizador)
   |                 |
   Scryfall bulk     tabelas: cards, sets, rulings, keywords, rules, combos
   CSB /variants/    view:    commanders
   Comp Rules .txt
```
O `cards` guarda colunas normalizadas (nome, custo, cores, identidade, tipo, texto,
preço, legalidade…) **e** o objeto Scryfall completo num `jsonb data` — assim nenhum
atributo se perde e dá pra consultar qualquer coisa depois.

## Setup (PowerShell)
```powershell
# 1. configuração
copy .env.example .env          # ajuste senhas se quiser

# 2. sobe o Postgres
docker compose up -d

# 3. ambiente Python
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# 4. cria as tabelas
python -m mtg_brain init-db

# 5. ingere tudo (cards demora mais: baixa ~100 MB de bulk)
python -m mtg_brain ingest all
#   ou em partes:
python -m mtg_brain ingest sets catalogs
python -m mtg_brain ingest cards
python -m mtg_brain ingest combos

# 6. confere
python -m mtg_brain stats
```

### Regras (Comprehensive Rules)
O link do `.txt` muda a cada coleção. Pegue o atual em
<https://magic.wizards.com/en/rules>, ponha em `CR_TXT_URL` no `.env` e rode
`python -m mtg_brain ingest rules`. (Sem o link, o ingestor tenta descobri-lo na página.)

## Comandos
| Comando | O que faz |
|---|---|
| `init-db` | cria/atualiza o schema |
| `ingest <alvos…>` | `sets`, `catalogs`, `cards`, `rulings`, `rules`, `combos` ou `all` |
| `stats` | conta registros por tabela |

A ingestão é **idempotente** (tudo é upsert), então pode rodar de novo pra atualizar.

## Consultas
Veja [`query/examples.sql`](query/examples.sql) — comandantes por cor, cartas de dreno
baratas, combos que usam uma carta, etc. Conecte com qualquer client:
`psql postgresql://mtg:mtg@localhost:5432/mtg`

## Perguntar ao cérebro (Fase 3)
Pergunte em português; o LLM consulta o banco (SQL **somente-leitura**) e responde
fundamentado nos dados, citando cartas e regras. Backend padrão: **Ollama local** ($0, ilimitado).

Pré-requisito (uma vez): instale o [Ollama](https://ollama.com) e baixe um modelo com tool calling:
```powershell
ollama pull qwen2.5:7b      # ~4.7 GB; 14b é mais esperto se a GPU der conta
```
Depois:
```powershell
python -m mtg_brain ask "que combos existem com Gravecrawler?"
python -m mtg_brain ask "comandantes UB bons pra dreno, ate US$5" -v
```
`-v` mostra as queries SQL que o modelo rodou. Backend/modelo se configuram no `.env`
(`LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`) — também serve pra Groq/Gemini grátis.
Implementação em [`mtg_brain/brain.py`](mtg_brain/brain.py).

## Roadmap
- **Fase 1 — Ingestão** ✅
- **Fase 2 — Banco consultável** ✅
- **Fase 3 — Cérebro (RAG via tool use)** ✅ — comando `ask`
- **Próximo**: otimizador de deck; busca semântica (pgvector); logs de partida (Forge self-play).

## Notas
- **Atribuição**: dados de cartas/preços via Scryfall; combos via Commander Spellbook;
  regras © Wizards of the Coast. Este projeto não é afiliado nem endossado por eles.
- **Python 3.14**: se o `psycopg[binary]` não tiver wheel pronto, use Python 3.12, ou
  instale o `libpq` e troque por `psycopg` (sem `[binary]`).
- `data/` e `.env` ficam fora do git (veja `.gitignore`).
