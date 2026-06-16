import { useState, type FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { CardSummary, DeckCardRow } from '../api'
import DeckAnalysis from '../components/DeckAnalysis'

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

  function submit(e: FormEvent) {
    e.preventDefault()
    if (name.trim()) create.mutate()
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Meus decks</h1>
      <form onSubmit={submit} className="flex flex-wrap gap-2 mb-6">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="nome do deck"
          className="bg-surface border border-border rounded-md px-3 py-2 text-sm flex-1 min-w-40 outline-none focus:border-primary"
        />
        <input
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          placeholder="comandante (ex.: Meren of Clan Nel Toth)"
          className="bg-surface border border-border rounded-md px-3 py-2 text-sm flex-1 min-w-56 outline-none focus:border-primary"
        />
        <button className="bg-primary text-white rounded-md px-4 py-2 text-sm font-medium">Criar</button>
      </form>

      <div className="space-y-2">
        {data?.map((d) => (
          <button
            key={d.id}
            onClick={() => onOpen(d.id)}
            className="w-full text-left bg-surface border border-border rounded-lg p-3 hover:border-primary transition"
          >
            <div className="font-medium">{d.name}</div>
            <div className="text-xs text-muted">
              {d.commander ?? 'sem comandante'} · {d.cards ?? 0} cartas
            </div>
          </button>
        ))}
        {data && data.length === 0 && (
          <p className="text-muted text-sm">Nenhum deck ainda — crie um acima.</p>
        )}
      </div>
    </div>
  )
}

function CardLine({ c, onRemove }: { c: DeckCardRow; onRemove: () => void }) {
  return (
    <div className="group relative flex items-center justify-between bg-surface rounded px-3 py-1.5 text-sm border border-border">
      <span className={c.is_commander ? 'text-accent' : ''}>
        {c.is_commander ? '★ ' : ''}
        {c.name}
        {c.qty > 1 ? ` ×${c.qty}` : ''}
      </span>
      <span className="flex items-center gap-3 text-xs text-muted">
        <span>{c.usd != null ? `$${c.usd.toFixed(2)}` : '—'}</span>
        <button onClick={onRemove} className="hover:text-red-400">
          remover
        </button>
      </span>
      {c.image && (
        <div className="hidden group-hover:block absolute left-full top-0 ml-2 z-30 pointer-events-none">
          <img
            src={c.image}
            alt={c.name}
            className="w-56 rounded-lg shadow-2xl border border-border"
          />
        </div>
      )}
    </div>
  )
}

function DeckView({ id, onBack }: { id: number; onBack: () => void }) {
  const qc = useQueryClient()
  const { data: deck } = useQuery({ queryKey: ['deck', id], queryFn: () => api.getDeck(id) })
  const { data: analysis } = useQuery({
    queryKey: ['deck-analysis', id],
    queryFn: () => api.deckAnalysis(id),
  })
  const [q, setQ] = useState('')
  const [submitted, setSubmitted] = useState('')
  const search = useQuery({
    queryKey: ['cardsearch', submitted],
    queryFn: () => api.searchCards(submitted),
    enabled: submitted.length > 0,
  })
  const suggestions = useQuery({
    queryKey: ['suggest', deck?.commander],
    queryFn: () => api.suggest(deck!.commander!),
    enabled: !!deck?.commander,
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['deck', id] })
    qc.invalidateQueries({ queryKey: ['deck-analysis', id] })
  }
  const clearSearch = () => {
    setQ('')
    setSubmitted('')
  }
  const add = useMutation({
    mutationFn: (c: CardSummary) => api.addCard(id, c.name),
    onSuccess: () => {
      refresh()
      clearSearch()
    },
  })
  const remove = useMutation({ mutationFn: (name: string) => api.removeCard(id, name), onSuccess: refresh })

  const showResults = submitted.length > 0 && (search.data?.length ?? 0) > 0

  return (
    <div>
      <button onClick={onBack} className="text-muted text-sm hover:text-text mb-3">
        ← decks
      </button>
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:flex-1 min-w-0">
          <h1 className="text-xl font-semibold">{deck?.name}</h1>
          <p className="text-muted text-sm mb-3">
            {deck?.commander ?? 'sem comandante'} · {analysis?.total_cards ?? deck?.cards.length ?? 0} cartas
            {deck ? ` (${deck.cards.length} únicas)` : ''}
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              setSubmitted(q.trim())
            }}
            className="flex gap-2 mb-2"
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="buscar carta pra adicionar"
              className="flex-1 bg-surface border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button className="bg-primary text-white rounded-md px-3 py-2 text-sm">Buscar</button>
            {submitted && (
              <button
                type="button"
                onClick={clearSearch}
                className="text-muted text-sm px-2 hover:text-text"
              >
                ✕
              </button>
            )}
          </form>

          {showResults && (
            <div className="mb-4 max-h-44 overflow-y-auto bg-surface border border-border rounded-md divide-y divide-border">
              {search.data!.slice(0, 15).map((c) => (
                <button
                  key={c.id}
                  onClick={() => add.mutate(c)}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-2 flex justify-between"
                >
                  <span>{c.name}</span>
                  <span className="text-muted text-xs">
                    {c.usd != null ? `$${c.usd.toFixed(2)} · ` : ''}+ add
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="space-y-1">
            {deck?.cards.map((c) => (
              <CardLine key={c.name} c={c} onRemove={() => remove.mutate(c.name)} />
            ))}
            {deck && deck.cards.length === 0 && (
              <p className="text-muted text-sm">Deck vazio — busque cartas acima pra adicionar.</p>
            )}
          </div>

          {suggestions.data && suggestions.data.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold mb-2">Sugestões pro {deck?.commander}</h3>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.data.slice(0, 18).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => add.mutate(c)}
                    className="text-xs bg-surface-2 rounded px-2 py-1 hover:bg-border"
                    title="adicionar ao deck"
                  >
                    + {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="lg:w-80 shrink-0 bg-surface border border-border rounded-lg p-4 h-fit">
          {analysis ? (
            <DeckAnalysis analysis={analysis} />
          ) : (
            <p className="text-muted text-sm">Carregando análise…</p>
          )}
        </div>
      </div>
    </div>
  )
}
