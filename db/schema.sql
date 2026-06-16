-- mtg-brain — schema (Fase 1/2: ingestão + banco)
-- Postgres. Estratégia: colunas normalizadas para consulta rápida + coluna `data` jsonb
-- com o objeto completo do Scryfall, pra nunca perdermos nenhum atributo.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS sets (
    code         text PRIMARY KEY,
    name         text,
    released_at  date,
    set_type     text,
    card_count   integer,
    digital      boolean,
    data         jsonb
);

CREATE TABLE IF NOT EXISTS cards (
    id               uuid PRIMARY KEY,        -- Scryfall print id (sempre presente e único)
    oracle_id        uuid,                    -- id da carta "gameplay-distinct"
    name             text NOT NULL,
    lang             text,
    released_at      date,
    mana_cost        text,
    cmc              numeric,
    type_line        text,
    oracle_text      text,
    power            text,
    toughness        text,
    loyalty          text,
    colors           text[],
    color_identity   text[],
    keywords         text[],
    rarity           text,
    set_code         text,
    collector_number text,
    edhrec_rank      integer,
    layout           text,
    reserved         boolean,
    legalities       jsonb,
    prices           jsonb,
    image_uris       jsonb,
    related_uris     jsonb,
    data             jsonb NOT NULL,          -- objeto Scryfall completo — nada se perde
    ingested_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cards_oracle_id_idx   ON cards (oracle_id);
CREATE INDEX IF NOT EXISTS cards_name_trgm_idx   ON cards USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS cards_text_trgm_idx   ON cards USING gin (oracle_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS cards_color_id_idx    ON cards USING gin (color_identity);
CREATE INDEX IF NOT EXISTS cards_type_line_idx   ON cards (type_line);
CREATE INDEX IF NOT EXISTS cards_edhrec_rank_idx ON cards (edhrec_rank);
CREATE INDEX IF NOT EXISTS cards_commander_idx   ON cards ((legalities->>'commander'));

CREATE TABLE IF NOT EXISTS rulings (
    id            bigserial PRIMARY KEY,
    oracle_id     uuid,
    source        text,
    published_at  date,
    comment       text NOT NULL,
    UNIQUE (oracle_id, comment)
);
CREATE INDEX IF NOT EXISTS rulings_oracle_id_idx ON rulings (oracle_id);

CREATE TABLE IF NOT EXISTS keywords (
    name      text NOT NULL,
    category  text NOT NULL,   -- keyword-ability | keyword-action | ability-word
    PRIMARY KEY (name, category)
);

CREATE TABLE IF NOT EXISTS rules (
    rule_number text PRIMARY KEY,   -- ex.: 509.1a
    section     text,               -- grupo de 3 dígitos, ex.: 509
    text        text NOT NULL,
    examples    text[]
);

CREATE TABLE IF NOT EXISTS combos (
    id              text PRIMARY KEY,
    card_names      text[],
    color_identity  text,
    prerequisites   text,
    steps           text,
    results         text[],
    data            jsonb
);

-- Comandantes: cartas legais em Commander que são criatura lendária
-- ou dizem explicitamente que podem ser seu comandante.
CREATE OR REPLACE VIEW commanders AS
SELECT *
FROM cards
WHERE (legalities->>'commander') = 'legal'
  AND (
        type_line ILIKE '%Legendary%Creature%'
     OR oracle_text ILIKE '%can be your commander%'
  );
