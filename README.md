# mtg-brain

[![CI](https://github.com/brunocmattos/mtg-brain/actions/workflows/ci.yml/badge.svg)](https://github.com/brunocmattos/mtg-brain/actions/workflows/ci.yml)

> Um “cérebro” local de **Magic: The Gathering** — banco de dados completo + API + app web. Tudo rodando na sua máquina, a custo **US$ 0**.

O mtg-brain ingere praticamente *tudo* de Magic (cartas, preços, legalidades, regras oficiais, combos), guarda em Postgres e expõe isso de duas formas: uma **API HTTP** e um **app web** com cara de site de Magic de verdade. Para perguntas em linguagem natural, um **servidor MCP** liga o banco direto ao Claude Code (ver [Inteligência via MCP](#inteligência-via-mcp)) — sem precisar de LLM local.

| | |
|---|---|
| **Stack** | Python · FastAPI · PostgreSQL 17 · React + TypeScript · Vite · Tailwind |
| **Fontes** | Scryfall · Commander Spellbook · Comprehensive Rules (WotC) · ManaPool (preços) |
| **Dados** | ~38 mil cartas · ~92 mil combos · regras oficiais · símbolos de mana oficiais |
| **Custo** | US$ 0 — banco + API em Docker (`docker compose up -d` sobe tudo) |

---

## O que dá pra fazer

- **Buscar comandantes** por tema (`vampire`, `sacrifice`, `mill`…), cor e preço, com a arte oficial das cartas.
- **Pesquisar qualquer carta** por nome ou texto de regras (`destroy target creature`, `loses life`…).
- **Busca semântica** (por *significado*, não por palavra): descreva o que procura (`punish opponents for drawing`, `reanimate a big creature`, `protect my board from a wrath`) e o app acha via **embeddings locais + pgvector** — toggle "Semântica ✨" na tela de Cartas.
- **Montar decks** a partir de um **seletor de comandante** com filtros (cor, CMC, tema), com busca, sugestões por comandante, preview grande da carta no canto, e visualização em **lista** ou **grade de imagens** (estilo Moxfield/Archidekt).
- **Trocar a versão/arte** de cada carta no deck (botão ⇄) — todas as impressões vêm do Scryfall sob demanda, com a arte e o preço de cada edição.
- **Analisar o deck**: contagem por tipo, curva de mana, identidade de cor, ramp/compra/interação/terrenos, **bracket** (sistema oficial WotC), **combos presentes**, um **rank de Poder & Consistência** (heurístico, *não* é taxa de vitória) e um indicador de **pontos fracos** ("o que falta": resposta em velocidade de instante, wipes, counters, ramp, compra…).
- **Preço do deck multi-fonte** com seletor (default **ManaPool**; também TCGplayer, Cardmarket, MTGO) e total em **US$ e R$** com bandeiras, mostrando **valor atual** (com as artes escolhidas) vs **valor base** (impressão mais barata de cada carta) e o quanto suas versões somam.
- **Importar decklist** (colar do Moxfield/Archidekt) e **exportar** em `.txt` (`<qtd> <nome>`, comandante no topo) — importável no Tabletop Simulator, Moxfield e Archidekt.
- **Criar deck com I.A.** via a skill **`/deck-creator`** no Claude Code: você dá comandante + bracket + orçamento, ela te questiona o necessário, monta o deck e importa no app pra você avaliar.
- **Perguntar em linguagem natural** via o **MCP** conectado ao Claude Code (sem LLM local) — ver abaixo.

### Telas

| Comandantes | Deckbuilder + análise |
|---|---|
| ![Comandantes](docs/img/commanders.png) | ![Deckbuilder](docs/img/deckbuilder.png) |

| Deck em grade | Seletor de comandante | Chat |
|---|---|---|
| ![Grade](docs/img/deck-grid.png) | ![Picker](docs/img/picker.png) | ![Chat](docs/img/chat.png) |

---

## Arquitetura

```
                         ┌──────────────────────────────────────────┐
  FONTES                 │                 INGESTÃO (ETL)            │
  Scryfall (bulk, API)   │  mtg_brain/ingest/  — idempotente,        │
  Commander Spellbook    │  resiliente a rate-limit, streaming ijson │
  Comprehensive Rules    └───────────────────────┬──────────────────┘
  ManaPool (preços)                              │
                                                  ▼
                                   ┌──────────────────────────────┐
                                   │   PostgreSQL 17 (Docker)      │
                                   │   cards · combos · rules ·    │
                                   │   rulings · sets · symbols ·  │
                                   │   decks · deck_cards          │
                                   │   view: commanders            │
                                   └───────┬───────────────┬───────┘
                                           ▼               ▼
        ┌────────────────────────────────────┐   ┌────────────────────────┐
        │  queries.py — SQL determinístico    │   │  servidor MCP (Postgres)│
        │  (busca, análise, bracket, combos)  │   │  conecta o banco ao     │
        └───────────────┬─────────────────────┘   │  Claude Code (NL → SQL) │
                        ▼                          └─────────────────────────┘
              ┌─────────────────────────────────────────────────────┐
              │  FastAPI (mtg_brain/api/app.py) — rotas /api/*       │
              │  serve também o build do React (mesma origem)        │
              └───────────────────────────┬─────────────────────────┘
                                          ▼
              ┌─────────────────────────────────────────────────────┐
              │  React + TS + Vite + Tailwind (web/)                 │
              │  Comandantes · Cartas · Decks                       │
              └─────────────────────────────────────────────────────┘
```

**Decisões de design**

- **`cards` guarda colunas normalizadas + o JSON Scryfall inteiro (`jsonb data`).** Nenhum atributo se perde; dá pra consultar qualquer campo depois sem reingerir.
- **RAG por *tool use*, não por embeddings.** O LLM ganha uma única ferramenta — rodar `SELECT` no Postgres — em vez de busca vetorial. Para dados estruturados (preço, cor, legalidade, combos), SQL é mais preciso e auditável. `pgvector` fica para busca semântica de texto de regra no futuro.
- **Guard-rails no SQL do LLM:** só `SELECT`/`WITH`, conexão `read_only`, `statement_timeout` de 15s. O modelo não consegue escrever no banco.
- **Tudo na mesma origem em produção:** a FastAPI serve o `web/dist`, com *fallback* de SPA — as rotas client-side (`/commanders`, `/decks`…) devolvem `index.html`.
- **Preço multi-fonte com default ManaPool:** o dump da ManaPool é ingerido pra tabela `manapool_prices` (evita 50 MB/req); a análise soma por fonte (ManaPool/TCGplayer/Cardmarket/MTGO) e o front deixa trocar a fonte exibida (salva no navegador), com total em USD/BRL.
- **Versão/arte por carta sob demanda:** só uma impressão representativa fica no banco; as outras edições vêm do Scryfall na hora (`/cards/search?unique=prints`) e a escolha grava em `deck_cards.printing` (jsonb), sem inchar a ingestão.
- **Símbolos de mana oficiais:** baixados do endpoint `/symbology` do Scryfall (SVG oficial), não recriados à mão.

Detalhe completo da arquitetura em **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

---

## Setup

Pré-requisitos: **Docker** e **Python 3.12+**.

```powershell
# 1. configuração
copy .env.example .env

# 2. sobe o Postgres
docker compose up -d

# 3. ambiente Python
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# 4. cria as tabelas e ingere os dados (cards + combos baixam ~centenas de MB)
python -m mtg_brain init-db
python -m mtg_brain ingest all
python -m mtg_brain ingest prices manapool symbols   # preços Scryfall + ManaPool + símbolos oficiais

# 5. confere
python -m mtg_brain stats

# 6. frontend (gera web/dist, que entra na imagem do app)
cd web; npm install; npm run build; cd ..

# 7. sobe TUDO (banco + API) via Docker — e religa sozinho no boot
docker compose up -d --build     # http://localhost:8000  (ou: .\iniciar.ps1)
```

> Depois disso é só abrir **http://localhost:8000** — o Docker reinicia banco + API sozinho
> quando você liga o PC (`restart: unless-stopped`). Não precisa rodar mais nada.
> Mudou o código? `docker compose up -d --build` reconstrói. Para desenvolvimento com
> hot-reload, rode a API no host: `uvicorn mtg_brain.api.app:app --reload` (pare o container
> `mtg-brain-api` antes, pra liberar a porta 8000).

> **Regras (Comprehensive Rules):** o `.txt` muda a cada coleção. Pegue o link atual em
> <https://magic.wizards.com/en/rules>, ponha em `CR_TXT_URL` no `.env` e rode
> `python -m mtg_brain ingest rules`.

### Inteligência via MCP

Para perguntas em linguagem natural ("quais combos com Gravecrawler?", "comandantes UB de dreno até US$5"), o banco é exposto ao **Claude Code** por um servidor **MCP** de Postgres — não há LLM local nem custo. Conecte uma vez:

```bash
claude mcp add mtg-brain -s user -- npx -y @modelcontextprotocol/server-postgres "postgresql://mtg:mtg@localhost:5432/mtg"
```

Depois é só perguntar no Claude Code; ele consulta o banco (read-only) e responde citando cartas, combos e regras. O app web foca no que faz bem de forma determinística (dados, busca, decks, análise).

---

## CLI

| Comando | O que faz |
|---|---|
| `python -m mtg_brain init-db` | cria/atualiza o schema |
| `python -m mtg_brain ingest <alvos…>` | `sets`, `catalogs`, `cards`, `rulings`, `rules`, `combos`, `prices`, `manapool`, `symbols`, `embeddings` ou `all` |
| `python -m mtg_brain stats` | conta registros por tabela |

A ingestão é **idempotente** (tudo é upsert) e **resumível** (combos retomam do offset em caso de rate-limit), então pode rodar de novo pra atualizar.

---

## API (resumo)

Tudo sob `/api`. Veja a doc interativa em `http://localhost:8000/docs` (Swagger, cortesia do FastAPI).

| Método e rota | Descrição |
|---|---|
| `GET /api/health` | status do banco |
| `GET /api/stats` | contagem por tabela |
| `GET /api/symbols` | mapa `{ "{W}": svg_uri, … }` (símbolos oficiais) |
| `GET /api/cards?q=&colors=&limit=` | busca de cartas por nome/texto |
| `GET /api/cards/semantic?q=` | busca semântica por significado (embeddings + pgvector) |
| `GET /api/cards/{id}` | detalhe da carta (+ rulings) |
| `GET /api/commanders` · `…/recommend` · `…/suggest` | lista / recomenda por tema / sugere cartas |
| `GET /api/combos?card=` · `?identity=` | combos por carta ou por identidade |
| `GET /api/fx/usd-brl` | cotação USD→BRL (cache, com fallback) |
| `GET /api/printings?card=` | todas as impressões/artes de uma carta (Scryfall, sob demanda) |
| `POST /api/decks/import` | importa decklist colada `{ name, text, commander? }` |
| `POST /api/decks` · `GET /api/decks` · `GET /api/decks/{id}` · `DELETE /api/decks/{id}` | CRUD de decks |
| `POST /api/decks/{id}/cards` · `DELETE …?name=` | adiciona / remove carta |
| `POST /api/decks/{id}/cards/printing` | troca a versão/arte de uma carta no deck |
| `GET /api/decks/{id}/analysis` | análise completa do deck (bracket, rank, preço multi-fonte, o que falta) |

---

## Por que NÃO existe um “gerar deck” automático

Um protótipo de gerador **determinístico** foi construído e medido — e descartado de propósito. Ele montava 100 cartas legais, na identidade de cor, com manabase/cotas razoáveis, dentro de bracket e orçamento. Mas, avaliado com honestidade, ele escolhia por **popularidade (rank EDHREC)** e **nunca lia o texto do comandante**: não modelava o plano de jogo, não montava uma linha de combo coerente e não pontuava sinergia entre as cartas. Ou seja, entregava um *“goodstuff”* legal, não um deck **afinado**.

Construir um deck realmente bom exige **julgamento** — entender o motor do comandante, definir a vitória, escolher peças que conversam com o plano. Isso é trabalho de **I.A./LLM**, não de uma fórmula. Por isso a geração e a otimização de deck são deliberadamente delegadas ao **cérebro** (Claude Code via MCP), e o app foca no que faz bem de forma **determinística e auditável**: dados, busca, construção manual e análise. O racional completo está em [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#geração-de-deck-decisão-de-arquitetura).

Na prática, a geração é feita pela skill **`/deck-creator`** do Claude Code: você dá comandante + bracket + orçamento, ela te questiona o que falta, lê o comandante e consulta o banco (cartas legais na cor, combos, preços) pra montar um deck **afinado** com motor e vitória definidos, e importa direto no app via `POST /api/decks/import` pra você avaliar.

---

## Estrutura do projeto

```
mtg_brain/
  cli.py            # CLI (init-db / ingest / stats)
  config.py db.py http.py fx.py
  queries.py        # SQL determinístico: busca, análise, bracket, rank, importador, versões/artes
  ingest/           # scryfall.py · combos.py · rules.py · manapool.py
  api/app.py        # FastAPI + serve o frontend
db/                 # schema.sql · schema_deck.sql (deck_cards.printing jsonb · manapool_prices)
web/                # React + TS + Vite + Tailwind
  src/pages/        # CommandersPage · CardsPage · DecksPage
  src/components/   # Mana · DeckAnalysis · CommanderPicker · DeckImporter · PrintingPicker · CardDetailModal …
Dockerfile · docker-compose.yml   # sobe banco + API juntos (restart: unless-stopped)
docs/               # ARCHITECTURE.md · img/
```

A skill `/deck-creator` mora fora do repo, em `~/.claude/skills/deck-creator/SKILL.md`.

---

## Roadmap

- **Fase 1 — Ingestão** ✅
- **Fase 2 — Banco consultável** ✅
- **Fase 3 — Inteligência via MCP (Claude Code)** ✅
- **Fase 4 — App web: deckbuilder, análise, preços multi-fonte, rank, importador/export, seletor de versão/arte** ✅
- **Fase 5 — Geração de deck via skill `/deck-creator` (Claude Code) + tudo no Docker** ✅
- **Fase 6 — Qualidade & RAG** ✅ — suíte de testes (pytest) + **CI no GitHub Actions**; **busca semântica** (pgvector + embeddings locais via fastembed).
- **Próximo:** refresh agendado de preços; registro de partidas/win-rate; testes de integração (com Postgres no CI).

## Notas e atribuição

- Dados de cartas/preços via **Scryfall**; combos via **Commander Spellbook**; regras © **Wizards of the Coast**. Projeto pessoal, **não** afiliado nem endossado por nenhum deles.
- Preços vêm da impressão ingerida e são **aproximados**. Terrenos básicos são tratados como grátis.
- `data/`, `.env`, `web/dist` e `web/node_modules` ficam fora do git (veja `.gitignore`).
```
