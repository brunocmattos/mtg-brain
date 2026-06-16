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

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`/api${path}`)
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json() as Promise<T>
}

export const api = {
  stats: () => get<Record<string, number>>('/stats'),

  recommendCommanders: (theme: string, colors: string[] = [], maxPrice?: number) => {
    const p = new URLSearchParams()
    if (theme) p.set('theme', theme)
    colors.forEach((c) => p.append('colors', c))
    if (maxPrice != null) p.set('max_price', String(maxPrice))
    p.set('limit', '24')
    return get<CardSummary[]>(`/commanders/recommend?${p.toString()}`)
  },

  card: (id: string) => get<CardDetail>(`/cards/${id}`),

  combosForCard: (name: string) =>
    get<Combo[]>(`/combos?card=${encodeURIComponent(name)}&limit=15`),

  chat: async (question: string): Promise<{ answer: string }> => {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    })
    if (!r.ok) throw new Error(`${r.status}`)
    return r.json() as Promise<{ answer: string }>
  },
}
