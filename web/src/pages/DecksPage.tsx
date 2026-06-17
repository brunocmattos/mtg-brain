import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { CardSummary, DeckCardRow, Deck } from '../api'
import DeckAnalysis from '../components/DeckAnalysis'
import CommanderPicker from '../components/CommanderPicker'
import DeckImporter from '../components/DeckImporter'
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
  const [pickerOpen, setPickerOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const create = useMutation({
    mutationFn: () => {
      const c = cmd.trim()
      return api.createDeck(name.trim() || c || 'Novo deck', c || null)
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['decks'] })
      onOpen(d.id)
    },
  })

  return (
    <div>
      <h1 className="font-display text-2xl font-bold mb-4">Meus decks</h1>

      <div className="bg-surface border border-border rounded-lg p-4 mb-6">
        <h2 className="font-display text-lg mb-3">Novo deck</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim() || cmd) create.mutate()
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="nome do deck"
            className="bg-bg border border-border rounded-md px-3 py-2 text-sm flex-1 min-w-44 outline-none focus:border-primary" />
          <button type="button" onClick={() => setPickerOpen(true)}
            className="bg-bg border border-border rounded-md px-3 py-2 text-sm hover:border-primary transition">
            {cmd ? `★ ${cmd}` : 'Escolher comandante…'}
          </button>
          {cmd && (
            <button type="button" onClick={() => setCmd('')} className="text-muted text-xs hover:text-text">limpar</button>
          )}
          <button disabled={(!name.trim() && !cmd) || create.isPending}
            className="bg-primary text-white rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50">
            {create.isPending ? 'Criando…' : 'Criar deck'}
          </button>
        </form>
        <p className="text-muted text-xs mt-2">
          O comandante define a identidade de cor do deck. Sem comandante, cria um deck vazio só com nome.
        </p>
        <div className="mt-3 border-t border-border pt-3">
          <button type="button" onClick={() => setImportOpen(true)} className="text-sm text-muted hover:text-accent">
            ⇪ Importar decklist (Moxfield / Archidekt / texto)
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {data?.map((d) => (
          <button key={d.id} onClick={() => onOpen(d.id)}
            className="w-full text-left bg-surface border border-border rounded-lg overflow-hidden hover:border-primary transition flex items-stretch h-20">
            {d.commander_image ? (
              <img src={d.commander_image} alt="" className="w-32 shrink-0 object-cover" />
            ) : (
              <div className="w-1.5 shrink-0 bg-primary/40" />
            )}
            <div className="p-3 flex-1 min-w-0 self-center">
              <div className="font-medium truncate">{d.name}</div>
              <div className="text-xs text-muted truncate">{d.commander ?? 'sem comandante'} · {d.cards ?? 0} cartas</div>
            </div>
          </button>
        ))}
        {data && data.length === 0 && <p className="text-muted text-sm">Nenhum deck ainda — crie um acima.</p>}
      </div>

      {pickerOpen && (
        <CommanderPicker
          onClose={() => setPickerOpen(false)}
          onSelect={(n) => {
            setCmd(n)
            if (!name.trim()) setName(n)
            setPickerOpen(false)
          }}
        />
      )}

      {importOpen && (
        <DeckImporter
          onClose={() => setImportOpen(false)}
          onImported={(deckId) => {
            setImportOpen(false)
            onOpen(deckId)
          }}
        />
      )}
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

// Decklist no formato "<qtd> <nome>" (comandante no topo) — lido pelos importadores
// de MTG do Tabletop Simulator, Moxfield, Archidekt, etc.
function deckToText(deck: Deck): string {
  const cmd = deck.cards.filter((c) => c.is_commander)
  const rest = deck.cards.filter((c) => !c.is_commander).sort((a, b) => a.name.localeCompare(b.name))
  return [...cmd, ...rest].map((c) => `${c.qty} ${c.name}`).join('\n') + '\n'
}

// tooltip com os 3 preços (TCGplayer USD / Cardmarket EUR / MTGO tix)
function priceTip(c: DeckCardRow): string {
  const parts: string[] = []
  if (c.usd != null) parts.push(`US$ ${c.usd.toFixed(2)}`)
  if (c.eur != null) parts.push(`€ ${c.eur.toFixed(2)}`)
  if (c.tix != null) parts.push(`${c.tix.toFixed(2)} tix`)
  return parts.length ? parts.join('  ·  ') : 'sem preço'
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
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
        <span title={priceTip(c)} className="cursor-help">{c.usd != null ? `$${c.usd.toFixed(2)}` : '—'}</span>
        {!c.is_commander && (
          <button onClick={onRemove} className="hover:text-red-400" title="remover">✕</button>
        )}
      </span>
    </div>
  )
}

function CardTile({
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
      className="group relative rounded-lg overflow-hidden border border-border bg-surface-2"
      title={priceTip(c)}
      onMouseEnter={() => onHover(c.image)}
      onMouseLeave={() => onHover(null)}
    >
      {c.image ? (
        <button onClick={() => onPin(c.image)} className="block w-full" title="fixar no canto">
          <img src={c.image} alt={c.name} loading="lazy" className="block w-full" />
        </button>
      ) : (
        <div className="aspect-[0.716] flex items-center justify-center p-2 text-center text-xs text-muted">{c.name}</div>
      )}
      {c.is_commander ? (
        <span className="absolute top-1 left-1 rounded bg-accent/90 px-1.5 py-0.5 text-[10px] font-bold text-bg">★</span>
      ) : c.qty > 1 ? (
        <span className="absolute top-1 left-1 rounded bg-bg/80 px-1.5 py-0.5 text-xs font-bold">×{c.qty}</span>
      ) : null}
      {!c.is_commander && (
        <button
          onClick={onRemove}
          title="remover"
          className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-bg/80 text-xs opacity-0 transition group-hover:opacity-100 hover:text-red-400"
        >
          ✕
        </button>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-bg/90 to-transparent px-2 py-1 text-right text-[11px] opacity-0 transition group-hover:opacity-100">
        {c.usd != null ? `$${c.usd.toFixed(2)}` : '—'}
      </div>
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
  const [toast, setToast] = useState<string | null>(null)
  const [view, setView] = useState<'list' | 'grid'>('list')
  const [confirmDel, setConfirmDel] = useState(false)
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
  const del = useMutation({
    mutationFn: () => api.deleteDeck(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['decks'] })
      onBack()
    },
  })

  const total = deck?.cards.reduce((s, c) => s + c.qty, 0) ?? 0
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flash = (msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2800)
  }
  const tryAdd = (c: CardSummary) => {
    if (total >= 100) {
      flash('Deck cheio (100 cartas). Remova uma carta antes de adicionar outra.')
      return
    }
    add.mutate(c)
  }
  // imagem fixada (clique) tem prioridade; senão, a do hover.
  const shown = pinned ?? hovered

  const commander = deck?.cards.find((c) => c.is_commander)
  const groups: Record<string, DeckCardRow[]> = {}
  for (const c of deck?.cards ?? []) (groups[bucket(c)] ??= []).push(c)

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button onClick={onBack} className="text-muted text-sm hover:text-text">← decks</button>
        <div className="flex items-center gap-3">
          {deck && deck.cards.length > 0 && (
            <button
              onClick={() => downloadText(`${(deck.name || 'deck').replace(/[/\\?%*:|"<>]/g, '').trim()}.txt`, deckToText(deck))}
              title="baixar decklist .txt (Tabletop Simulator, Moxfield, Archidekt…)"
              className="text-xs text-muted hover:text-accent"
            >
              ⬇ Exportar .txt
            </button>
          )}
          {confirmDel ? (
            <span className="flex items-center gap-2 text-xs">
              <span className="text-muted">Excluir este deck?</span>
              <button onClick={() => del.mutate()} className="font-medium text-red-400 hover:text-red-300">Confirmar</button>
              <button onClick={() => setConfirmDel(false)} className="text-muted hover:text-text">cancelar</button>
            </span>
          ) : (
            <button onClick={() => setConfirmDel(true)} className="text-xs text-muted hover:text-red-400">🗑 excluir deck</button>
          )}
        </div>
      </div>

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
          {submitted.length > 0 && (
            <div className="mb-4 max-h-44 overflow-y-auto bg-surface border border-border rounded-md divide-y divide-border">
              {search.isFetching ? (
                <p className="px-3 py-2 text-sm text-muted">Buscando…</p>
              ) : search.isError ? (
                <p className="px-3 py-2 text-sm text-red-400">Erro ao buscar.</p>
              ) : (search.data?.length ?? 0) === 0 ? (
                <p className="px-3 py-2 text-sm text-muted">Nada encontrado pra "{submitted}".</p>
              ) : (
                search.data!.slice(0, 15).map((c) => (
                  <button key={c.id} disabled={add.isPending} onClick={() => tryAdd(c)} onMouseEnter={() => setHovered(c.image)} onMouseLeave={() => setHovered(null)}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-2 flex justify-between disabled:opacity-50">
                    <span>{c.name}</span>
                    <span className="text-muted text-xs">{c.usd != null ? `$${c.usd.toFixed(2)} · ` : ''}+ add</span>
                  </button>
                ))
              )}
            </div>
          )}

          {deck && deck.cards.length === 0 && <p className="text-muted text-sm">Deck vazio — busque cartas acima.</p>}

          {deck && deck.cards.length > 0 && (
            <div className="mb-3 flex justify-end">
              <div className="inline-flex overflow-hidden rounded-md border border-border text-xs">
                <button onClick={() => setView('list')}
                  className={`px-3 py-1 ${view === 'list' ? 'bg-primary text-white' : 'text-muted hover:text-text'}`}>☰ Lista</button>
                <button onClick={() => setView('grid')}
                  className={`px-3 py-1 ${view === 'grid' ? 'bg-primary text-white' : 'text-muted hover:text-text'}`}>▦ Grade</button>
              </div>
            </div>
          )}

          {view === 'list' ? (
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
          ) : (
            <div className="space-y-5">
              {TYPE_ORDER.filter((t) => groups[t]?.length).map((t) => (
                <div key={t}>
                  <h3 className="text-accent text-xs font-semibold uppercase tracking-wide mb-2">
                    {TYPE_LABEL[t]} ({groups[t].reduce((s, c) => s + c.qty, 0)})
                  </h3>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                    {groups[t].map((c) => (
                      <CardTile key={c.name} c={c} onRemove={() => remove.mutate(c.name)} onHover={setHovered} onPin={setPinned} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {suggestions.data && suggestions.data.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold mb-2">Sugestões pro {deck?.commander}</h3>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.data.slice(0, 18).map((c) => (
                  <button key={c.id} disabled={add.isPending} onClick={() => tryAdd(c)} onMouseEnter={() => setHovered(c.image)} onMouseLeave={() => setHovered(null)}
                    className="text-xs bg-surface-2 rounded px-2 py-1 hover:bg-border disabled:opacity-50" title="adicionar ao deck">
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

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-surface-2 border border-primary/50 rounded-lg px-4 py-2 text-sm shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  )
}
