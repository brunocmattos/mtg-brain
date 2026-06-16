# Arquitetura do mtg-brain

Documento técnico de referência. Para visão geral e setup, veja o [README](../README.md).

## Sumário
1. [Camadas](#camadas)
2. [Modelo de dados](#modelo-de-dados)
3. [Ingestão (ETL)](#ingestão-etl)
4. [Camada de consulta determinística](#camada-de-consulta-determinística)
5. [O cérebro: RAG por tool use](#o-cérebro-rag-por-tool-use)
6. [Geração de deck (decisão de arquitetura)](#geração-de-deck-decisão-de-arquitetura)
7. [API + frontend](#api--frontend)
8. [Decisões e trade-offs](#decisões-e-trade-offs)

---

## Camadas

```
ingest → Postgres → (queries.py | brain.py) → FastAPI → React
```

Cada camada tem uma responsabilidade única:

- **ingest/** — baixa e normaliza dados externos. Não sabe nada sobre HTTP/UI.
- **Postgres** — a fonte única de verdade.
- **queries.py** — toda lógica de negócio *determinística* (busca, análise de deck, cálculo de bracket). Sem LLM, sem rede. Fácil de testar.
- **brain.py** — a única parte que usa LLM. Conversa livre.
- **api/app.py** — fina camada HTTP por cima de queries/brain; também serve o frontend.
- **web/** — SPA em React, consome `/api`.

A separação importa: a maior parte do app (busca, deck, análise) é **determinística e auditável**. O LLM só entra no chat. Isso torna o sistema previsível e barato.

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
- **Preços em duas etapas** — `cards` vem do bulk *oracle-cards* (1 impressão por carta); `ingest prices` depois preenche `usd` nulos a partir do bulk *default-cards*.
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
- **preço** (básicos contam como grátis — a tabela é oracle-cards e o Swamp vem marcado ~US$2, o que inflaria tudo);
- **combos presentes**: `card_names <@ deck_names` via índice GIN.

### Bracket (sistema oficial WotC, beta)

`_deck_bracket()` estima o bracket — e é honesto sobre o que dá e o que **não** dá para detectar:

- **Joga para o Bracket 4 (detectável com confiança):** mais de 3 *game changers*, *mass land denial*, encadeamento de turnos extras.
- **Combos de 2 cartas:** a regra diz que são proibidos no Bracket 3 **apenas se montam antes do turno 6**. A velocidade do combo **não** é mensurável automaticamente → vira um **aviso**, não um veredito. (Esse foi um ajuste importante: a primeira versão jogava qualquer combo de 2 cartas para o Bracket 4, o que estava errado.)

`GAME_CHANGERS` e `MASS_LAND_DENIAL` são conjuntos aproximados da lista oficial, usados como sinal.

---

## O cérebro: RAG por tool use

`brain.py`. Em vez de embeddings, o LLM recebe **uma ferramenta**: `run_sql(query)`.

```
usuário → LLM → (decide rodar SQL) → run_sql() → Postgres → linhas → LLM → resposta
```

- Cliente compatível com **OpenAI** apontando para o Ollama local (`/v1`).
- `run_sql` é **somente-leitura**: aceita só `SELECT`/`WITH`, abre a conexão como `read_only`, e aplica `SET LOCAL statement_timeout = 15s`.
- O *system prompt* proíbe o modelo de narrar o SQL para o usuário — ele responde em português citando cartas/regras.

**Por que tool use e não pgvector?** Para perguntas estruturadas (“comandantes UB de dreno até US$5”, “combos com Gravecrawler”), traduzir para SQL é mais **preciso e auditável** que recuperar trechos por similaridade. Busca semântica (pgvector) faz sentido para texto de regra em linguagem natural — fica no roadmap, complementar, não substituto.

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

Por isso o gerador determinístico foi **removido**, e a geração/otimização de deck é delegada ao **cérebro** — o chat (LLM) ou o Claude Code com acesso ao banco via MCP, que lê o deck atual, entende o plano e completa/otimiza. O app web foca no que faz bem de forma **determinística e auditável**: dados, busca, **seletor de comandante**, construção manual e análise.

> Lição de engenharia: vale construir o baseline determinístico, **medir com honestidade** e então decidir a fronteira entre o que é fórmula e o que é I.A. — em vez de fingir que uma fórmula “gera decks bons”.

---

## API + frontend

- **FastAPI** (`api/app.py`): rotas sob `/api` num `APIRouter`. CORS liberado só para o dev server do Vite. Em produção monta `web/dist` em `/assets` e tem um *catch-all* GET que devolve `index.html` (fallback de SPA) com proteção contra *path traversal*.
- **React + TS + Vite + Tailwind v4** (tokens de tema via `@theme`, fonte *Cinzel* para o clima épico).
- **TanStack Query** para data fetching/cache; **react-router** para as 4 telas.
- **Símbolos de mana** (`components/Mana.tsx`): busca `/api/symbols` (cache infinito) e tokeniza `{...}` no texto/custo, trocando por `<img>` do SVG oficial.

---

## Decisões e trade-offs

| Decisão | Por quê | Trade-off |
|---|---|---|
| JSON Scryfall inteiro no `cards` | nunca perder atributo; consultar depois | tabela maior |
| RAG por tool use (SQL) | preciso/auditável p/ dados estruturados | não cobre similaridade semântica (→ pgvector depois) |
| LLM local (Ollama) | US$ 0, privado, ilimitado | mais lento que API paga; precisa de GPU decente |
| Geração de deck via LLM, não fórmula | qualidade real: plano de jogo + sinergia | fora do app determinístico; precisa de modelo forte |
| Mesma origem (API serve o SPA) | deploy simples, sem CORS em prod | rebuild do front a cada release |
| Básicos = grátis no preço | realismo (você já os tem) | preço ignora básicos premium |
