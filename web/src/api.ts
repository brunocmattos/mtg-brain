export interface CardSummary {
  id: string
  name: string
  mana_cost: string | null
  cmc: number | null
  type_line: string | null
  color_identity: string[] | null
  rarity: string | null
  set_code: string | null
  edhrec_rank: number | null
  usd: number | null
  image: string | null
  image_small: string | null
  commander_legal: string | null
}

export interface CardDetail extends CardSummary {
  oracle_text: string | null
  keywords: string[] | null
  power: string | null
  toughness: string | null
  loyalty: string | null
  oracle_id: string
  usd_foil: number | null
  image_large: string | null
  legalities: Record<string, string> | null
  card_faces: unknown[] | null
  rulings: string[]
}

export interface Combo {
  id: string
  card_names: string[]
  color_identity: string | null
  results: string[]
  steps?: string | null
  prerequisites?: string | null
}

export interface ImportResult {
  deck_id: number
  deck_name: string
  commander: string | null
  added: number
  total_cards: number
  total_parsed: number
  missing: string[]
  over_limit: boolean
}

export interface DeckSummary {
  id: number
  name: string
  commander: string | null
  created_at: string
  cards?: number
  commander_image?: string | null
}

export interface Printing {
  scryfall_id: string
  set: string
  set_name: string
  collector_number: string
  image: string | null
  art_crop: string | null
  usd: string | null
  eur: string | null
  tix: string | null
}

export interface DeckCardRow {
  id: string
  name: string
  qty: number
  is_commander: boolean
  type_line: string | null
  cmc: number | null
  mana_cost: string | null
  color_identity: string[] | null
  usd: number | null
  eur: number | null
  tix: number | null
  image: string | null
  art_crop: string | null
  printing: Printing | null
}

export interface Deck {
  id: number
  name: string
  commander: string | null
  created_at: string
  cards: DeckCardRow[]
}

export interface Health {
  value: number
  status: string
  alvo: string
}

export interface DeckCombo {
  id: string
  card_names: string[]
  results: string[]
  steps: string | null
  prerequisites: string | null
}

export interface DeckAnalysisData {
  total_cards: number
  types: Record<string, number>
  predominant_type: string | null
  curve: Record<string, number>
  avg_cmc: number
  colors: Record<string, number>
  identity: string[]
  completeness: { total: number; complete: boolean; has_commander: boolean; off_color: string[] }
  bracket: { level: number; name: string; reason: string; note: string | null }
  power: {
    score: number
    label: string
    verdict: string
    note: string | null
    axes: { key: string; label: string; score: number; detail: string }[]
  }
  gaps: { severity: string; text: string }[]
  interaction_detail: { total: number; instant_speed: number; wipes: number; counters: number }
  game_changers: string[]
  health: { lands: Health; ramp: Health; draw: Health; interaction: Health }
  price_usd: number
  price_eur: number
  price_tix: number
  price_manapool: number
  missing_price: string[]
  combos_present: DeckCombo[]
}

export interface FxRate {
  rate: number
  source: string
}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`/api${path}`)
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json() as Promise<T>
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`${r.status}`)
  return r.json() as Promise<T>
}

async function del<T>(path: string): Promise<T> {
  const r = await fetch(`/api${path}`, { method: 'DELETE' })
  if (!r.ok) throw new Error(`${r.status}`)
  return r.json() as Promise<T>
}

export const api = {
  stats: () => get<Record<string, number>>('/stats'),

  recommendCommanders: (
    theme: string, colors: string[] = [], maxPrice?: number, sort = 'edhrec',
    cmcMin?: number, cmcMax?: number,
  ) => {
    const p = new URLSearchParams()
    if (theme) p.set('theme', theme)
    colors.forEach((c) => p.append('colors', c))
    if (maxPrice != null) p.set('max_price', String(maxPrice))
    if (cmcMin != null) p.set('cmc_min', String(cmcMin))
    if (cmcMax != null) p.set('cmc_max', String(cmcMax))
    p.set('sort', sort)
    p.set('limit', '100')
    return get<CardSummary[]>(`/commanders/recommend?${p.toString()}`)
  },

  listCommanders: (
    colors: string[] = [], maxPrice?: number, sort = 'edhrec',
    cmcMin?: number, cmcMax?: number,
  ) => {
    const p = new URLSearchParams()
    colors.forEach((c) => p.append('colors', c))
    if (maxPrice != null) p.set('max_price', String(maxPrice))
    if (cmcMin != null) p.set('cmc_min', String(cmcMin))
    if (cmcMax != null) p.set('cmc_max', String(cmcMax))
    p.set('sort', sort)
    p.set('limit', '100')
    return get<CardSummary[]>(`/commanders?${p.toString()}`)
  },

  searchCards: (q: string, colors: string[] = [], sort = 'edhrec', limit = 100) => {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    colors.forEach((c) => p.append('colors', c))
    p.set('sort', sort)
    p.set('limit', String(limit))
    return get<CardSummary[]>(`/cards?${p.toString()}`)
  },

  card: (id: string) => get<CardDetail>(`/cards/${id}`),

  combosForCard: (name: string) =>
    get<Combo[]>(`/combos?card=${encodeURIComponent(name)}&limit=15`),

  listDecks: () => get<DeckSummary[]>('/decks'),
  createDeck: (name: string, commander: string | null) =>
    post<DeckSummary>('/decks', { name, commander }),
  importDeck: (name: string, text: string, commander: string | null) =>
    post<ImportResult>('/decks/import', { name, text, commander }),
  getDeck: (id: number) => get<Deck>(`/decks/${id}`),
  deleteDeck: (id: number) => del<{ ok: boolean }>(`/decks/${id}`),
  addCard: (id: number, card_name: string, is_commander = false) =>
    post<{ ok: boolean }>(`/decks/${id}/cards`, { card_name, qty: 1, is_commander }),
  removeCard: (id: number, name: string) =>
    del<{ ok: boolean }>(`/decks/${id}/cards?name=${encodeURIComponent(name)}`),
  deckAnalysis: (id: number) => get<DeckAnalysisData>(`/decks/${id}/analysis`),
  cardPrintings: (card: string) => get<Printing[]>(`/printings?card=${encodeURIComponent(card)}`),
  setPrinting: (deckId: number, cardName: string, printing: Printing | null) =>
    post<{ ok: boolean }>(`/decks/${deckId}/cards/printing`, { card_name: cardName, printing }),
  suggest: (commander: string) =>
    get<CardSummary[]>(`/commanders/suggest?commander=${encodeURIComponent(commander)}&limit=30`),
  symbols: () => get<Record<string, string>>('/symbols'),
  fx: () => get<FxRate>('/fx/usd-brl'),
}
