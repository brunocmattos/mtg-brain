# Arquitetura do mtg-brain

Documento técnico de referência. Para visão geral e setup, veja o [README](../README.md).

## Sumário
1. [Camadas](#camadas)
2. [Modelo de dados](#modelo-de-dados)
3. [Ingestão (ETL)](#ingestão-etl)
4. [Camada de consulta determinística](#camada-de-consulta-determinística)
5. [Inteligência via MCP (Claude Code)](#inteligência-via-mcp-claude-code)
6. [Geração de deck (decisão de arquitetura)](#geração-de-deck-decisão-de-arquitetura)
7. [API + frontend](#api--frontend)
8. [Decisões e trade-offs](#decisões-e-trade-offs)

---

## Camadas

```
ingest → Postgres → queries.py → FastAPI → React
                   ↘ servidor MCP → Claude Code (linguagem natural → SQL)
```

Cada camada tem uma responsabilidade única:

- **ingest/** — baixa e normaliza dados externos. Não sabe nada sobre HTTP/UI.
- **Postgres** — a fonte única de verdade.
- **queries.py** — toda lógica de negócio *determinística* (busca, análise de deck, cálculo de bracket). Sem rede. Fácil de testar.
- **api/app.py** — fina camada HTTP por cima de queries; também serve o frontend.
- **web/** — SPA em React, consome `/api`.
- **MCP (Postgres)** — expõe o banco ao Claude Code para perguntas em linguagem natural (read-only).

A separação importa: o app inteiro é **determinístico e auditável**. A parte de I.A. (linguagem natural) fica fora do app, no Claude Code via MCP — o app não embute LLM nenhum. Isso torna o sistema previsível e barato.

---

## Modelo de dados

Tabelas principais (`db/schema.sql` e `db/schema_deck.sql`):

| Tabela | Conteúdo |
|---|---|
| `cards` | uma linha por carta (oracle). Colunas normalizadas (nome, custo, cmc, cores, identidade, tipo, texto, raridade, set, rank EDHREC, preços, legalidades, imagens) **+ `jsonb data`** com o objeto Scryfall inteiro. |
| `combos` | combos do Commander Spellbook: `card_names text[]`, `color_identity`, `results`, `steps`, `prerequisites`. Índice GIN em `card_names`. |
| `rules` | Comprehensive Rules parseadas (número da regra + texto). |
| `rulings` | rulings oficiais por `oracle_id`. |
| `sets`, `card_symbols` | coleções; símbolos de mana (`{W}` → SVG oficial). |
| `decks`, `deck_cards` | decks do usuário. `deck_cards` PK `(deck_id, card_name)` com `qty` e `is_commander`. |
| `commanders` (view) | `cards` filtradas por “pode ser comandante”. |

**Por que guardar o JSON inteiro?** Scryfall tem dezenas de campos (faces duplas, frame effects, finishes…). Normalizar tudo seria frágil. Guardando `data jsonb`, qualquer atributo continua acessível por SQL (`data->'card_faces'->0->…`) sem reingestão. As colunas normalizadas existem só para o que é consultado com frequência (índices, filtros).

Cartas dupla-face têm `image_uris` nulo no topo; o helper `_img()` faz *fallback* para `data->'card_faces'->0->'image_uris'`.

---

## Ingestão (ETL)

`mtg_brain/ingest/`. Propriedades:

- **Idempotente** — tudo é `INSERT … ON CONFLICT DO UPDATE`. Rodar de novo = atualizar.
- **Streaming** — o bulk de cartas (centenas de MB) é lido com `ijson` (`use_float=True`) sem carregar tudo na memória.
- **Resiliente a rate-limit** — `combos` (Commander Spellbook, paginado) retoma do offset `floor(count/100)*100`, com *backoff* crescente e captura de quedas de conexão. Resultado típico: ~92 mil combos.
- **Preços em duas etapas** — `cards` vem do bulk *oracle-cards* (1 impressão por carta); `ingest prices` depois preenche `usd`/`eur`/`tix` nulos a partir do bulk *default-cards*.
- **ManaPool** — `ingest manapool` baixa o dump público da ManaPool (`/api/v1/prices/singles`, ~100k impressões), reduz ao menor preço NM por nome de carta e faz `TRUNCATE` + `COPY` na tabela `manapool_prices`. Os amigos do Bruno definem o teto de orçamento pelo preço ManaPool, por isso é a **fonte default** da análise.
- **Símbolos oficiais** — `/symbology` → `card_symbols`. O frontend renderiza os SVGs oficiais, sem recriar símbolos.

---

## Camada de consulta determinística

`queries.py` — o coração do app. Helpers de baixo nível:

- `_rows(sql, params)` — executa e dá `rollback` (leitura pura, à prova de efeito colateral).
- `_write(sql, params)` — executa e dá `commit`.
- `_jsonable(row)` — converte `date`/`Decimal` para tipos JSON.
- `_img(size)` — expressão SQL de imagem com *fallback* de dupla-face.

Funções de negócio: `search_cards`, `list_commanders`, `recommend_commanders`, `combos_for_card`, `get_deck`, `deck_analysis`, `suggest_cards`, etc.

### Análise de deck (`deck_analysis`)

Calcula, só com heurísticas sobre o texto da carta:

- contagem por tipo, **curva de mana**, CMC médio, identidade/contagem de cor;
- **saúde**: terrenos, ramp (`add {…}`, *search … land*), compra (regex `draws? \w+ cards?`), interação (destroy/exile/counter/return);
- **completude**: 100 cartas? tem comandante? cartas fora da identidade?
- **bracket** (ver abaixo);
- **preço multi-fonte** (ManaPool/TCGplayer/Cardmarket/MTGO somados por carta; básicos contam como grátis — a tabela é oracle-cards e o Swamp vem marcado ~US$2, o que inflaria tudo; o front escolhe a fonte e converte USD→BRL via `/api/fx/usd-brl`). Devolve **valor atual** (`price_usd/eur/tix`, honrando a arte escolhida via `COALESCE(printing, base)`) **e valor base** (`price_*_base` = soma da impressão mais barata de cada carta). ManaPool é indexado por *nome* (já o mais barato), então nessa fonte base = atual e trocar arte não muda o total;
- **rank de Poder & Consistência** (heurístico, 0–100 sobre eixos consistência/interação/ameaça — *não* é taxa de vitória; sem log público de partidas, win-rate real é impossível, e isso é dito explicitamente na UI);
- **o que falta** (`_deck_gaps`): aponta lacunas com severidade (alto/médio/baixo) — ex.: pouca interação em **velocidade de instante**, sem wipes, sem counters, ramp/compra abaixo do saudável;
- **combos presentes**: `card_names <@ deck_names` via índice GIN.

### Versão/arte por carta

Só uma impressão representativa por carta fica no banco (bulk oracle-cards). Quando o usuário quer outra arte/edição, `card_printings(name)` busca as impressões no **Scryfall sob demanda** (`/cards/search?q=!"NAME"&unique=prints`, com cache em memória) e `set_printing` grava a escolha em `deck_cards.printing` (jsonb). A análise e a exibição passam a usar essa impressão (imagem, art_crop e preço) via `COALESCE`. Assim o seletor de versão funciona sem ingerir ~500k impressões no banco.

### Bracket (sistema oficial WotC, beta)

`_deck_bracket()` estima o bracket — e é honesto sobre o que dá e o que **não** dá para detectar:

- **Joga para o Bracket 4 (detectável com confiança):** mais de 3 *game changers*, *mass land denial*, encadeamento de turnos extras.
- **Combos de 2 cartas:** a regra diz que são proibidos no Bracket 3 **apenas se montam antes do turno 6**. A velocidade do combo **não** é mensurável automaticamente → vira um **aviso**, não um veredito. (Esse foi um ajuste importante: a primeira versão jogava qualquer combo de 2 cartas para o Bracket 4, o que estava errado.)

`GAME_CHANGERS` e `MASS_LAND_DENIAL` são conjuntos aproximados da lista oficial, usados como sinal.

---

## Inteligência via MCP (Claude Code)

A parte de "perguntar em linguagem natural" **não vive no app** — ela é delegada ao **Claude Code** através de um servidor **MCP** de Postgres (`@modelcontextprotocol/server-postgres`) apontado para o banco do mtg-brain.

```
usuário → Claude Code → (MCP) consulta SQL no Postgres → linhas → resposta citando cartas/combos/regras
```

- Conecta uma vez: `claude mcp add mtg-brain -s user -- npx -y @modelcontextprotocol/server-postgres "postgresql://mtg:mtg@localhost:5432/mtg"`.
- O acesso é **read-only** (o conector de Postgres do MCP abre transações somente-leitura).
- **US$ 0 e sem LLM local:** o modelo é o próprio Claude Code; não há Ollama nem dependência de GPU.

**Histórico / decisão:** uma versão anterior embutia um chat no app com LLM local (Ollama, via uma ferramenta `run_sql`). Foi **removida** — o modelo local (14b) não tinha qualidade suficiente e consumia disco/RAM. Tradução de pergunta → SQL para dados estruturados ("comandantes UB de dreno até US$5", "combos com Gravecrawler") é mais **precisa e auditável** que busca por similaridade; e fazê-la via Claude Code dá qualidade real sem custo. **Busca semântica (pgvector) — implementada:** cada carta tem um embedding 768-d (texto = nome + tipo + oráculo) gerado por **fastembed** (`BAAI/bge-base-en-v1.5`, ONNX, local e grátis — bem mais leve que um LLM) na coluna `cards.embedding`, com índice **HNSW** (cosine). A busca é **híbrida + rerank** (arquitetura RAG *retrieve → rerank*), tudo local/grátis:
1. **Retrieve:** funde a busca **vetorial** (pgvector, query com o prefixo de instrução do bge; corpus sem prefixo) com a **full-text** do Postgres (coluna gerada `fts` = `to_tsvector` de nome+tipo+oráculo, índice GIN; a query vira **OR** dos termos pra não exigir todos juntos) via **Reciprocal Rank Fusion** (RRF, k=60).
2. **Rerank:** reordena os ~100 candidatos com um **cross-encoder** (`Xenova/ms-marco-MiniLM-L-6-v2`, ONNX, ~80 MB) que lê *query + carta juntos* — bem melhor que bi-encoder pra intenção.

`GET /api/cards/semantic?q=` faz tudo isso; filtra a `commander='legal'` (corta cartas de piada/ilegais). Os modelos (embedding + reranker) vêm pré-baixados na imagem e rodam no container (Python 3.12); `ingest embeddings` recria a coluna na dimensão do modelo e (re)popula. **Qualidade (honesta):** excelente em queries de ação+objeto ("counter target spell unless they pay", "sacrifice creatures for value", "reanimate a big creature"); intenções **causais/abstratas** ("punir o oponente POR comprar", "proteger de um board wipe") ainda escapam — limite de *recall* da recuperação + um reranker pequeno que não domina a causalidade de MTG. Levers além (custo de footprint/$): reranker forte (`bge-reranker-base` ~1 GB) ou rerank via LLM — opcionais.

---

## Geração de deck (decisão de arquitetura)

**O app não tem um “gerar deck” automático — por decisão consciente.**

Um gerador **determinístico** foi prototipado e medido. Ele montava 100 cartas legais na identidade do comandante, com manabase e cotas (`ramp/draw/interaction/other/land`), filtro de bracket (cap de *game changers*, sem MLD/turnos extras em ≤3) e orçamento (com escolha por melhor rank EDHREC dentro de um teto por slot). Tecnicamente sólido — entregava um deck **completo, legal e jogável**.

Mas uma auditoria honesta (inclusive um agente cético independente) concluiu que ele:

- escolhe por **popularidade (rank EDHREC)**, não por sinergia;
- **nunca lê o texto do comandante** — o comandante só serve de filtro de cor/preço e chave na tabela de combos;
- não monta uma **linha de combo coerente** (inclui uma peça mesmo sem a outra metade);
- não pontua **sinergia entre cartas**.

Conclusão: produzia um *“goodstuff”* legal, **não** um deck afinado em torno do plano de jogo do comandante. Como construir um bom deck exige **julgamento** (entender o motor, definir a vitória, casar peças com o plano), isso é trabalho de **I.A./LLM**, não de fórmula.

Por isso o gerador determinístico foi **removido**, e a geração/otimização de deck é delegada ao **Claude Code** (via MCP, com acesso read-only ao banco), que lê o deck atual, entende o plano e completa/otimiza. O app web foca no que faz bem de forma **determinística e auditável**: dados, busca, **seletor de comandante**, construção manual, análise e importação/exportação.

Na prática isso é uma **skill** do Claude Code: `/deck-creator` (em `~/.claude/skills/deck-creator/SKILL.md`). O fluxo: questiona o usuário sobre comandante, bracket e orçamento → lê o texto do comandante e consulta o banco via MCP (cartas legais na cor, combos, preços ManaPool) → monta ~100 cartas com motor + vitória definidos, dentro do bracket/orçamento → importa no app via `POST /api/decks/import` → o usuário avalia o deck pronto na plataforma. A skill é instruída a ser honesta sobre tradeoffs (o que cortou, onde o orçamento apertou).

> Lição de engenharia: vale construir o baseline determinístico, **medir com honestidade** e então decidir a fronteira entre o que é fórmula e o que é I.A. — em vez de fingir que uma fórmula “gera decks bons”.

---

## API + frontend

- **FastAPI** (`api/app.py`): rotas sob `/api` num `APIRouter`. CORS liberado só para o dev server do Vite. Em produção monta `web/dist` em `/assets` e tem um *catch-all* GET que devolve `index.html` (fallback de SPA) com proteção contra *path traversal*.
- **React + TS + Vite + Tailwind v4** (tokens de tema via `@theme`, fonte *Cinzel* para o clima épico).
- **TanStack Query** para data fetching/cache; **react-router** para as 3 telas (Comandantes, Cartas, Decks).
- **Símbolos de mana** (`components/Mana.tsx`): busca `/api/symbols` (cache infinito) e tokeniza `{...}` no texto/custo, trocando por `<img>` do SVG oficial.

### Docker sobe tudo

O `docker-compose.yml` tem dois serviços: `db` (Postgres 17, volume nomeado `mtg_pgdata`) e `app` (build do `Dockerfile`: Python 3.12-slim + `mtg_brain/` + `web/dist`, rodando uvicorn na 8000). Ambos com `restart: unless-stopped`, então o app **religa sozinho no boot do PC** — não precisa subir uvicorn na mão. `docker compose up -d` sobe os dois; mudou código, `--build` reconstrói a imagem do `app`. (Antes a API era um uvicorn no host, o que causava "container rodando mas não acessa" — o container era só o banco.) Persistência mora no volume `mtg_pgdata`; desligar o PC abruptamente pode perder o último flush do WSL2, então decks recém-criados podem sumir num crash — mitigação é shutdown limpo.

---

## Decisões e trade-offs

| Decisão | Por quê | Trade-off |
|---|---|---|
| JSON Scryfall inteiro no `cards` | nunca perder atributo; consultar depois | tabela maior |
| Linguagem natural via MCP + Claude Code (não LLM embutido) | qualidade real, US$ 0, sem GPU; SQL preciso/auditável | precisa do Claude Code conectado; sem chat dentro do app |
| Geração de deck via skill `/deck-creator` (Claude Code) | qualidade real: plano de jogo + sinergia | fora do app determinístico; precisa do Claude Code |
| ManaPool como fonte default de preço | é o preço que os amigos usam de teto | mais uma ingestão (`ingest manapool`) pra manter atualizada |
| Versões/artes via Scryfall sob demanda | seletor de versão sem ingerir ~500k impressões | depende do Scryfall online na hora de trocar a arte |
| Docker sobe banco + API (`restart: unless-stopped`) | religa sozinho, sem chamar ninguém | rebuild da imagem a cada mudança de código |
| Mesma origem (API serve o SPA) | deploy simples, sem CORS em prod | rebuild do front a cada release |
| Básicos = grátis no preço | realismo (você já os tem) | preço ignora básicos premium |
