-- Deck Builder (Fase 3) — migration ADITIVA e idempotente. Não toca na tabela `cards`.
CREATE TABLE IF NOT EXISTS decks (
    id          bigserial PRIMARY KEY,
    name        text NOT NULL,
    commander   text,                       -- nome da carta comandante
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deck_cards (
    deck_id       bigint NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    card_name     text NOT NULL,
    qty           integer NOT NULL DEFAULT 1,
    is_commander  boolean NOT NULL DEFAULT false,
    PRIMARY KEY (deck_id, card_name)
);

CREATE INDEX IF NOT EXISTS deck_cards_deck_idx ON deck_cards (deck_id);

-- Impressão escolhida (arte/edição) por carta — opcional. NULL = usa a padrão (mais barata).
-- jsonb: { scryfall_id, set, set_name, collector_number, image, art_crop, usd, eur, tix }
ALTER TABLE deck_cards ADD COLUMN IF NOT EXISTS printing jsonb;

-- Performance do Deck Builder: lookup de carta por nome (análise/preço, equality)
-- e busca de combos por conjunto de cartas (containment <@ em 91k arrays).
CREATE INDEX IF NOT EXISTS cards_name_idx ON cards (name);
CREATE INDEX IF NOT EXISTS combos_card_names_gin ON combos USING gin (card_names);

-- Símbolos oficiais do Scryfall (/symbology) — SVG oficial por símbolo ({W},{B},{T},…).
CREATE TABLE IF NOT EXISTS card_symbols (
    symbol   text PRIMARY KEY,
    svg_uri  text NOT NULL
);
