import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { CardSummary, DeckCardRow } from '../api'
import DeckAnalysis from '../components/DeckAnalysis'
import { ManaCost } from '../components/Mana'

export default function DecksPage() {
  const [selected, setSelected] = useState<number | null>(null)
  return selected == null ? (
    <DeckList onOpen={setSelected} />
  ) : (
    <DeckView id={selected} onBack={() => setSelected(null)} />
  )
}

function DeckList({ onOpen }: { onOpen: (id: number) => void }) {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['decks'], queryFn: api.listDecks })
  const [name, setName] = useState('')
  const [cmd, setCmd] = useState('')
  const create = useMutation({
    mutationFn: () => api.createDeck(name.trim(), cmd.trim() || null),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['decks'] })
      onOpen(d.id)
    },
  })
  return (
    <div>
      <h1 className="font-display text-2xl font-bold mb-4">Meus decks</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) create.mutate()
        }}
        className="flex flex-wrap gap-2 mb-6"
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="nome do deck"
          className="bg-surface border border-border rounded-md px-3 py-2 text-sm flex-1 min-w-40 outline-none focus:border-primary" />
        <input value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder="comandante (ex.: Meren of Clan Nel Toth)"
          className="bg-surface border border-border rounded-md px-3 py-2 text-sm flex-1 min-w-56 outline-none focus:border-primary" />
        <button className="bg-primary text-white rounded-md px-4 py-2 text-sm font-medium">Criar</button>
      </form>
      <div className="space-y-2">
        {data?.map((d) => (
          <button key={d.id} onClick={() => onOpen(d.id)}
            className="w-full text-left bg-surface border border-border rounded-lg p-3 hover:border-primary transition">
            <div className="font-medium">{d.name}</div>
            <div className="text-xs text-muted">{d.commander ?? 'sem comandante'} · {d.cards ?? 0} cartas</div>
          </button>
        ))}
        {data && data.length === 0 && <p className="text-muted text-sm">Nenhum deck ainda — crie um acima.</p>}
      </div>
    </div>
  )
}

const TYPE_ORDER = ['commander', 'creature', 'planeswalker', 'instant', 'sorcery', 'artifact', 'enchantment', 'battle', 'land', 'outro']
const TYPE_LABEL: Record<string, string> = {
  commander: 'Comandante', creature: 'Criaturas', planeswalker: 'Planeswalkers',
  instant: 'Instants', sorcery: 'Sorceries', artifact: 'Artefatos',
  enchantment: 'Encantamentos', battle: 'Battles', land: 'Terrenos', outro: 'Outros',
}
function bucket(c: DeckCardRow): string {
  if (c.is_commander) return 'commander'
  const t = (c.type_line ?? '').toLowerCase()
  for (const k of ['land', 'creature', 'planeswalker', 'instant', 'sorcery', 'artifact', 'enchantment', 'battle']) {
    if (t.includes(k)) return k
  }
  return 'outro'
}

function CardLine({
  c,
  onRemove,
  onHover,
  onPin,
}: {
  c: DeckCardRow
  onRemove: () => void
  onHover: (img: string | null) => void
  onPin: (img: string | null) => void
}) {
  return (
    <div
      onMouseEnter={() => onHover(c.image)}
      onMouseLeave={() => onHover(null)}
      className="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-surface-2"
    >
      <button onClick={() => onPin(c.image)} className={`truncate text-left hover:text-primary ${c.is_commander ? 'text-accent' : ''}`}>
        {c.is_commander ? '★ ' : ''}
        {c.name}
        {c.qty > 1 ? ` ×${c.qty}` : ''}
      </button>
      <span className="flex items-center gap-2 text-xs text-muted shrink-0 pl-2">
        <ManaCost cost={c.mana_cost} />
        <span>{c.usd != null ? `$${c.usd.toFixed(2)}` : '—'}</span>
        <button onClick={onRemove} className="hover:text-red-400" title="remover">✕</button>
      </span>
    </div>
  )
}

function DeckView({ id, onBack }: { id: number; onBack: () => void }) {
  const qc = useQueryClient()
  const { data: deck } = useQuery({ queryKey: ['deck', id], queryFn: () => api.getDeck(id) })
  const { data: analysis } = useQuery({ queryKey: ['deck-analysis', id], queryFn: () => api.deckAnalysis(id) })
  const [q, setQ] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [hovered, setHovered] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const search = useQuery({ queryKey: ['cardsearch', submitted], queryFn: () => api.searchCards(submitted), enabled: submitted.length > 0 })
  const suggestions = useQuery({ queryKey: ['suggest', deck?.commander], queryFn: () => api.suggest(deck!.commander!), enabled: !!deck?.commander })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['deck', id] })
    qc.invalidateQueries({ queryKey: ['deck-analysis', id] })
  }
  const clearSearch = () => {
    setQ('')
    setSubmitted('')
  }
  const add = useMutation({ mutationFn: (c: CardSummary) => api.addCard(id, c.name), onSuccess: () => { refresh(); clearSearch() } })
  const remove = useMutation({ mutationFn: (name: string) => api.removeCard(id, name), onSuccess: refresh })

  const total = deck?.cards.reduce((s, c) => s + c.qty, 0) ?? 0
  const tryAdd = (c: CardSummary) => {
    if (total >= 100 && !window.confirm(`O deck já tem ${total} cartas (limite 100). Adicionar assim mesmo?`)) return
    add.mutate(c)
  }
  // imagem fixada (clique) tem prioridade; senão, a do hover.
  const shown = pinned ?? hovered

  const showResults = submitted.length > 0 && (search.data?.length ?? 0) > 0
  const commander = deck?.cards.find((c) => c.is_commander)
  const groups: Record<string, DeckCardRow[]> = {}
  for (const c of deck?.cards ?? []) (groups[bucket(c)] ??= []).push(c)

  return (
    <div>
      <button onClick={onBack} className="text-muted text-sm hover:text-text mb-3">← decks</button>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:flex-1 min-w-0">
          <div
            className="relative rounded-xl overflow-hidden border border-border mb-4 cursor-pointer h-36"
            onClick={() => commander?.image && setPinned(commander.image)}
            title="fixar comandante no canto"
          >
            {commander?.art_crop && (
              <img src={commander.art_crop} alt="" className="absolute inset-0 w-full h-full object-cover" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/60 to-bg/10" />
            <div className="absolute bottom-0 left-0 p-4">
              <h1 className="font-display text-2xl font-bold drop-shadow-lg">{deck?.name}</h1>
              <p className="text-accent text-sm">{deck?.commander ?? 'sem comandante'}</p>
              <p className="text-muted text-xs">
                {analysis?.total_cards ?? total} cartas{deck ? ` (${deck.cards.length} únicas)` : ''}
              </p>
            </div>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); setSubmitted(q.trim()) }} className="flex gap-2 mb-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="buscar carta pra adicionar"
              className="flex-1 bg-surface border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-primary" />
            <button className="bg-primary text-white rounded-md px-3 py-2 text-sm">Buscar</button>
            {submitted && <button type="button" onClick={clearSearch} className="text-muted text-sm px-2 hover:text-text">✕</button>}
          </form>
          {showResults && (
            <div className="mb-4 max-h-44 overflow-y-auto bg-surface border border-border rounded-md divide-y divide-border">
              {search.data!.slice(0, 15).map((c) => (
                <button key={c.id} onClick={() => tryAdd(c)} onMouseEnter={() => setHovered(c.image)} onMouseLeave={() => setHovered(null)}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-2 flex justify-between">
                  <span>{c.name}</span>
                  <span className="text-muted text-xs">{c.usd != null ? `$${c.usd.toFixed(2)} · ` : ''}+ add</span>
                </button>
              ))}
            </div>
          )}

          {deck && deck.cards.length === 0 && <p className="text-muted text-sm">Deck vazio — busque cartas acima.</p>}
          <div className="columns-1 sm:columns-2 gap-4">
            {TYPE_ORDER.filter((t) => groups[t]?.length).map((t) => (
              <div key={t} className="break-inside-avoid mb-4">
                <h3 className="text-accent text-xs font-semibold uppercase tracking-wide mb-1">
                  {TYPE_LABEL[t]} ({groups[t].reduce((s, c) => s + c.qty, 0)})
                </h3>
                {groups[t].map((c) => (
                  <CardLine key={c.name} c={c} onRemove={() => remove.mutate(c.name)} onHover={setHovered} onPin={setPinned} />
                ))}
              </div>
            ))}
          </div>

          {suggestions.data && suggestions.data.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold mb-2">Sugestões pro {deck?.commander}</h3>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.data.slice(0, 18).map((c) => (
                  <button key={c.id} onClick={() => tryAdd(c)} onMouseEnter={() => setHovered(c.image)} onMouseLeave={() => setHovered(null)}
                    className="text-xs bg-surface-2 rounded px-2 py-1 hover:bg-border" title="adicionar ao deck">
                    + {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="lg:w-80 shrink-0 bg-surface border border-border rounded-lg p-4 h-fit">
          {analysis ? <DeckAnalysis analysis={analysis} /> : <p className="text-muted text-sm">Carregando análise…</p>}
        </div>
      </div>

      {/* preview no canto: hover = espiada; clique = fixa (com ✕ pra soltar) */}
      {shown && (
        <div className="hidden md:block fixed bottom-5 right-5 z-40 w-80">
          <img src={shown} alt="" className="w-full rounded-xl shadow-2xl border border-border" />
          {pinned && (
            <button onClick={() => setPinned(null)}
              className="absolute -top-2 -right-2 bg-surface border border-border rounded-full w-6 h-6 text-xs hover:text-red-400">✕</button>
          )}
        </div>
      )}
    </div>
  )
}
