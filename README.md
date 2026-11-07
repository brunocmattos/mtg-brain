<p align="center">
  <img src="docs/assets/banner.png" alt="mtg-brain: o cérebro local de Magic: The Gathering para Commander" width="100%">
</p>

<p align="center">
  <em>Todas as cartas, todos os combos, análise de deck e preços. Na sua máquina, a custo US$ 0.</em><br>
  Banco completo de Magic + API + app web + servidor MCP pro Claude Code.
</p>

<p align="center">
  <a href="https://github.com/brunocmattos/mtg-brain/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/brunocmattos/mtg-brain/ci.yml?branch=master&style=for-the-badge&label=CI&labelColor=0b0710" alt="CI"></a>
  <img src="https://img.shields.io/badge/custo-US%24_0-d4af37?style=for-the-badge&labelColor=0b0710" alt="Custo US$ 0">
  <img src="https://img.shields.io/badge/formato-Commander_%2F_EDH-7c3aed?style=for-the-badge&labelColor=0b0710" alt="Commander / EDH">
  <br>
  <img src="https://img.shields.io/badge/Python-0b0710?style=for-the-badge&logo=python&logoColor=d4af37" alt="Python">
  <img src="https://img.shields.io/badge/FastAPI-0b0710?style=for-the-badge&logo=fastapi&logoColor=d4af37" alt="FastAPI">
  <img src="https://img.shields.io/badge/PostgreSQL_+_pgvector-0b0710?style=for-the-badge&logo=postgresql&logoColor=d4af37" alt="PostgreSQL + pgvector">
  <img src="https://img.shields.io/badge/React-0b0710?style=for-the-badge&logo=react&logoColor=a78bfa" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-0b0710?style=for-the-badge&logo=typescript&logoColor=a78bfa" alt="TypeScript">
  <img src="https://img.shields.io/badge/Docker-0b0710?style=for-the-badge&logo=docker&logoColor=a78bfa" alt="Docker">
  <img src="https://img.shields.io/badge/MCP-0b0710?style=for-the-badge&logo=modelcontextprotocol&logoColor=a78bfa" alt="MCP">
</p>

<p align="center">
  <img src="docs/assets/deck.jpg" alt="Tela de deck: lista por tipo, carta do comandante em destaque e o painel de análise com preço, poder, ficha do deck e bracket">
</p>

O mtg-brain ingere praticamente *tudo* de Magic (cartas, preços, legalidades, regras oficiais, combos), guarda em Postgres e expõe isso de duas formas: uma **API HTTP** e um **app web** com cara de site de Magic de verdade. Para perguntas em linguagem natural, um **servidor MCP** liga o banco direto ao Claude Code (ver [Inteligência via MCP](#inteligência-via-mcp)), sem precisar de LLM local.

| | |
|---|---|
| **Stack** | Python · FastAPI · PostgreSQL 17 + pgvector · React + TypeScript · Vite · Tailwind |
| **Fontes** | Scryfall · Commander Spellbook · Comprehensive Rules (WotC) · ManaPool (preços) |
| **Dados** | ~36 mil cartas · ~92 mil combos · regras oficiais · símbolos de mana oficiais |
| **Custo** | US$ 0: banco + API em Docker, embeddings locais, nenhuma API paga |

---

## O que dá pra fazer

- **Buscar comandantes** por tema (`vampire`, `sacrifice`, `mill`…), cor e preço, com a arte oficial das cartas.
- **Pesquisar qualquer carta** por nome ou texto de regras (`destroy target creature`, `loses life`…).
- **Busca semântica** (por *significado*, não por palavra): descreva o que procura (`reanimate a big creature`, `counter target spell unless they pay`, `sacrifice creatures for value`). Busca **híbrida** (embeddings + full-text via RRF) com **rerank por cross-encoder**, tudo local e grátis. Toggle "Semântica ✨" na tela de Cartas.
- **Montar decks** a partir de um **seletor de comandante** com filtros (cor, CMC, tema), com busca, sugestões por comandante, preview grande da carta e visualização em **lista** ou **grade de imagens** (estilo Moxfield/Archidekt).
- **Trocar a versão/arte** de cada carta no deck (botão ⇄): todas as impressões vêm do Scryfall sob demanda, com a arte e o preço de cada edição.
- **Analisar o deck**: contagem por tipo, curva de mana, identidade de cor, ramp/compra/interação/terrenos, **bracket** (sistema oficial WotC), **combos presentes**, um **rank de Poder & Consistência** (heurístico, *não* é taxa de vitória), a **ficha do deck** em atributos de RPG e um indicador de **pontos fracos** ("o que falta": resposta em velocidade de instante, wipes, counters, ramp, compra…).
- **Preço do deck multi-fonte** com seletor (padrão **ManaPool**; também TCGplayer, Cardmarket, MTGO) e total em **US$ e R$**, mostrando **valor atual** (com as artes escolhidas) vs **valor base** (impressão mais barata de cada carta).
- **Importar decklist** (colar do Moxfield/Archidekt) e **exportar** em `.txt` (`<qtd> <nome>`, comandante no topo), importável no Tabletop Simulator, Moxfield e Archidekt.
- **Criar deck com I.A.** via a skill **`/deck-creator`** no Claude Code: você dá comandante + bracket + orçamento, ela te questiona o necessário, monta o deck e importa no app pra você avaliar.
- **Perguntar em linguagem natural** via o **MCP** conectado ao Claude Code (sem LLM local).

## Telas

| Comandantes | Busca semântica |
|---|---|
| ![Comandantes mais jogados, com a arte oficial, cor e preço](docs/assets/commanders.jpg) | ![Cartas encontradas pela busca semântica "reanimate a big creature from a graveyard"](docs/assets/cards.jpg) |

| Deck em grade de imagens |
|---|
| ![Deck em grade de imagens, com o painel de análise ao lado](docs/assets/deck-grid.jpg) |

<p align="center">
  <img src="docs/assets/mobile-commanders.jpg" alt="Comandantes no celular" width="280">
  &nbsp;&nbsp;
  <img src="docs/assets/mobile-analysis.png" alt="Análise do deck no celular: preço, poder e ficha do deck" width="280"><br>
  <sub>Também funciona no celular.</sub>
</p>

---

## Como rodar

Pré-requisitos: **Docker**, **Python 3.12+** e **Node 20+**. Os comandos abaixo são do PowerShell (Windows).

```powershell
# 1. configuração
copy .env.example .env

# 2. sobe só o Postgres (a API ainda não tem o build do front)
docker compose up -d db

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

# 7. sobe TUDO (banco + API) via Docker, e religa sozinho no boot
docker compose up -d --build     # http://localhost:8000  (ou: .\iniciar.ps1)

# 8. embeddings da busca semântica (roda no container, onde o fastembed já vem instalado)
docker compose exec app python -m mtg_brain ingest embeddings
```

> Depois disso é só abrir **http://localhost:8000**. O Docker reinicia banco + API sozinho
> quando você liga o PC (`restart: unless-stopped`). Não precisa rodar mais nada.
> Mudou o código? `docker compose up -d --build` reconstrói.

> **Regras (Comprehensive Rules):** o `.txt` muda a cada coleção. Pegue o link atual em
> <https://magic.wizards.com/en/rules>, ponha em `CR_TXT_URL` no `.env` e rode
> `python -m mtg_brain ingest rules`.

### Desenvolvimento

- **API com hot-reload:** pare o container `mtg-brain-api` (libera a porta 8000) e rode `uvicorn mtg_brain.api.app:app --reload` no host.
- **Front com hot-reload:** `cd web; npm run dev` abre o Vite em http://localhost:5173, com proxy de `/api` pra porta 8000.
- **Testes:** `pip install -r requirements-dev.txt` e depois `pytest`. São testes de função pura, rodam sem banco. O CI (GitHub Actions) roda lint + testes e o build da imagem Docker.

### Inteligência via MCP

Para perguntas em linguagem natural ("quais combos com Gravecrawler?", "comandantes UB de dreno até US$5"), o banco é exposto ao **Claude Code** por um servidor **MCP** de Postgres. Não há LLM local nem custo. Conecte uma vez:

```bash
claude mcp add mtg-brain -s user -- npx -y @modelcontextprotocol/server-postgres "postgresql://mtg:mtg@localhost:5432/mtg"
```

Depois é só perguntar no Claude Code; ele consulta o banco (read-only) e responde citando cartas, combos e regras. O app web foca no que faz bem de forma determinística (dados, busca, decks, análise).

---

## Arquitetura

```
                         ┌──────────────────────────────────────────┐
  FONTES                 │                 INGESTÃO (ETL)            │
  Scryfall (bulk, API)   │  mtg_brain/ingest/  — idempotente,        │
  Commander Spellbook    │  resiliente a rate-limit, streaming JSONL │
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
- **RAG por *tool use* para dados estruturados.** O LLM ganha uma única ferramenta (rodar `SELECT` no Postgres) em vez de busca vetorial. Para preço, cor, legalidade e combos, SQL é mais preciso e auditável. O `pgvector` entra só onde significado importa: a busca semântica de cartas.
- **Guard-rails no SQL do LLM:** só `SELECT`/`WITH`, conexão `read_only`, `statement_timeout` de 15s. O modelo não consegue escrever no banco.
- **Tudo na mesma origem em produção:** a FastAPI serve o `web/dist`, com *fallback* de SPA. As rotas client-side (`/commanders`, `/decks/:id`…) devolvem `index.html`.
- **Preço multi-fonte com padrão ManaPool:** o dump da ManaPool é ingerido pra tabela `manapool_prices` (evita 50 MB por requisição); a análise soma por fonte (ManaPool/TCGplayer/Cardmarket/MTGO) e o front deixa trocar a fonte exibida (salva no navegador), com total em USD/BRL.
- **Versão/arte por carta sob demanda:** só uma impressão representativa fica no banco; as outras edições vêm do Scryfall na hora (`/cards/search?unique=prints`) e a escolha grava em `deck_cards.printing` (jsonb), sem inchar a ingestão.
- **Símbolos de mana oficiais:** baixados do endpoint `/symbology` do Scryfall (SVG oficial), não recriados à mão.

Detalhe completo da arquitetura em **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

---

## CLI

| Comando | O que faz |
|---|---|
| `python -m mtg_brain init-db` | cria/atualiza o schema |
| `python -m mtg_brain ingest <alvos…>` | `sets`, `catalogs`, `cards`, `rulings`, `rules`, `combos`, `prices`, `manapool`, `symbols`, `embeddings` ou `all` (`all` = sets, catalogs, cards, rulings, rules, combos) |
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
| `PUT /api/decks/{id}/guide` | grava o guia do deck (markdown) |
| `GET /api/decks/{id}/analysis` | análise completa do deck (bracket, rank, preço multi-fonte, o que falta) |

---

## Por que NÃO existe um "gerar deck" automático

Um protótipo de gerador **determinístico** foi construído, medido e descartado de propósito. Ele montava 100 cartas legais, na identidade de cor, com manabase/cotas razoáveis, dentro de bracket e orçamento. Mas, avaliado com honestidade, ele escolhia por **popularidade (rank EDHREC)** e **nunca lia o texto do comandante**: não modelava o plano de jogo, não montava uma linha de combo coerente e não pontuava sinergia entre as cartas. Ou seja, entregava um *"goodstuff"* legal, não um deck **afinado**.

Construir um deck realmente bom exige **julgamento**: entender o motor do comandante, definir a vitória, escolher peças que conversam com o plano. Isso é trabalho de **I.A./LLM**, não de uma fórmula. Por isso a geração e a otimização de deck são deliberadamente delegadas ao **cérebro** (Claude Code via MCP), e o app foca no que faz bem de forma **determinística e auditável**: dados, busca, construção manual e análise. O racional completo está em [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#geração-de-deck-decisão-de-arquitetura).

Na prática, a geração é feita pela skill **`/deck-creator`** do Claude Code: você dá comandante + bracket + orçamento, ela te questiona o que falta, lê o comandante e consulta o banco (cartas legais na cor, combos, preços) pra montar um deck **afinado** com motor e vitória definidos, e importa direto no app via `POST /api/decks/import` pra você avaliar.

---

## Estrutura do projeto

```
mtg_brain/
  cli.py            # CLI (init-db / ingest / stats)
  config.py db.py http.py fx.py embed.py
  queries.py        # SQL determinístico: busca, análise, bracket, rank, importador, versões/artes
  ingest/           # scryfall.py · combos.py · rules.py · manapool.py · embeddings.py
  api/app.py        # FastAPI + serve o frontend
db/                 # schema.sql · schema_deck.sql (deck_cards.printing jsonb · manapool_prices)
web/                # React + TS + Vite + Tailwind
  src/pages/        # CommandersPage · CardsPage · DecksPage
  src/components/   # Mana · DeckAnalysis · CommanderPicker · DeckImporter · PrintingPicker · CardDetailModal …
tests/              # pytest (funções puras, sem banco)
Dockerfile · docker-compose.yml   # sobe banco + API juntos (restart: unless-stopped)
docs/               # ARCHITECTURE.md · METODO_POTENCIA_COMMANDER.md · assets/ (logo, screenshots)
```

A skill `/deck-creator` mora fora do repo, em `~/.claude/skills/deck-creator/SKILL.md`.

---

## Roadmap

- **Fase 1: Ingestão** ✅
- **Fase 2: Banco consultável** ✅
- **Fase 3: Inteligência via MCP (Claude Code)** ✅
- **Fase 4: App web** (deckbuilder, análise, preços multi-fonte, rank, importador/export, seletor de versão/arte) ✅
- **Fase 5: Geração de deck via skill `/deck-creator` (Claude Code) + tudo no Docker** ✅
- **Fase 6: Qualidade & RAG** ✅ suíte de testes (pytest) + **CI no GitHub Actions**; **busca semântica** (pgvector + embeddings locais via fastembed).
- **Próximo:** refresh agendado de preços; registro de partidas/win-rate; testes de integração (com Postgres no CI).

## Notas e atribuição

- Dados de cartas/preços via **Scryfall**; combos via **Commander Spellbook**; regras © **Wizards of the Coast**. Projeto pessoal, **não** afiliado nem endossado por nenhum deles. As imagens de carta nas screenshots são © Wizards of the Coast, servidas pelo Scryfall.
- Preços vêm da impressão ingerida e são **aproximados**. Terrenos básicos são tratados como grátis.
- `data/`, `.env`, `web/dist` e `web/node_modules` ficam fora do git (veja `.gitignore`).
