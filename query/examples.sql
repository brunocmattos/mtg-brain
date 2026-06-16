-- Exemplos de consulta (Fase 3 vai empacotar isto numa camada de uso).

-- Comandantes mono-preto (identidade de cor exatamente {B}), por popularidade no EDHREC.
SELECT name, mana_cost, edhrec_rank
FROM commanders
WHERE color_identity = ARRAY['B']
ORDER BY edhrec_rank NULLS LAST
LIMIT 20;

-- Cartas de "dreno" baratas, dentro da identidade preta, legais em Commander.
SELECT name, mana_cost, (prices->>'usd')::numeric AS usd
FROM cards
WHERE 'B' = ANY (color_identity)
  AND oracle_text ILIKE '%loses%life%'
  AND (legalities->>'commander') = 'legal'
  AND (prices->>'usd')::numeric < 5
ORDER BY usd NULLS LAST
LIMIT 30;

-- Todos os combos que usam uma carta específica (ex.: o motor do seu Wilhelt).
SELECT id, card_names, results
FROM combos
WHERE 'Gravecrawler' = ANY (card_names)
LIMIT 20;

-- Combos dentro de uma identidade de cor (ex.: preto puro).
SELECT id, card_names, results
FROM combos
WHERE color_identity = 'B'
LIMIT 20;

-- Distribuição de cartas por raridade.
SELECT rarity, count(*) FROM cards GROUP BY rarity ORDER BY 2 DESC;

-- Regras (mecânicas) que mencionam uma palavra-chave (ex.: deathtouch).
SELECT rule_number, text FROM rules WHERE text ILIKE '%deathtouch%' ORDER BY rule_number;
