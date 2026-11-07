import { useState, useRef } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../api'
import type { CardSummary, DeckCardRow, Deck, Printing } from '../api'
import DeckAnalysis from '../components/DeckAnalysis'
import CommanderPicker from '../components/CommanderPicker'
import DeckImporter from '../components/DeckImporter'
import PrintingPicker from '../components/PrintingPicker'
import CardImage from '../components/CardImage'
import Modal from '../components/Modal'
import { ManaCost } from '../components/Mana'
import { EmptyState, ErrorState, Loading } from '../components/States'
import { useMediaQuery } from '../hooks'

const input = 'bg-bg border border-border-strong rounded-md px-3 py-2 text-sm focus:border-primary'

export function DeckList() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { data, error, isPending, refetch } = useQuery({ queryKey: ['decks'], queryFn: api.listDecks })
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
      navigate(`/decks/${d.id}`)
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
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="nome do deck" aria-label="Nome do deck"
            className={`${input} flex-1 min-w-44`} />
          <button type="button" onClick={() => setPickerOpen(true)}
            className="bg-bg border border-border-strong rounded-md px-3 py-2 text-sm hover:border-primary transition">
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
        {create.isError && <p role="alert" className="mt-2 text-sm text-red-400">Não consegui criar o deck: {create.error.message}</p>}
        <p className="text-muted text-xs mt-2">
          O comandante define a identidade de cor do deck. Sem comandante, cria um deck vazio só com nome.
        </p>
        <div className="mt-3 border-t border-border pt-3">
          <button type="button" onClick={() => setImportOpen(true)} className="text-sm text-muted hover:text-accent">
            ⇪ Importar decklist (Moxfield / Archidekt / texto)
          </button>
        </div>
      </div>

      {isPending ? (
        <Loading label="Carregando decks…" />
      ) : error ? (
        <ErrorState error={error} title="Não consegui carregar seus decks" onRetry={() => refetch()} />
      ) : data.length === 0 ? (
        <EmptyState icon="🂠" title="Nenhum deck ainda" hint="Escolha um comandante e crie o primeiro deck acima, ou importe uma decklist do Moxfield/Archidekt." />
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {data.map((d) => (
            <li key={d.id}>
              <Link to={`/decks/${d.id}`}
                className="w-full text-left bg-surface border border-border rounded-lg overflow-hidden hover:border-primary transition flex items-stretch h-20">
                {d.commander_image ? (
                  <img src={d.commander_image} alt="" className="w-32 shrink-0 bg-surface-2 object-cover" />
                ) : (
                  <div className="w-1.5 shrink-0 bg-primary/40" />
                )}
                <div className="p-3 flex-1 min-w-0 self-center">
                  <div className="font-medium truncate">{d.name}</div>
                  <div className="text-xs text-muted truncate">{d.commander ?? 'sem comandante'} · {d.cards ?? 0} cartas</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

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
            navigate(`/decks/${deckId}`)
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

// Decklist no formato "<qtd> <nome> (SET) <número>" (comandante no topo) — lido pelos
// importadores de MTG do Tabletop Simulator, Moxfield, Archidekt, etc. O sufixo (SET) número
// (formato Arena) faz o importador puxar a IMPRESSÃO EXATA escolhida (a "skin"/arte), em vez
// da impressão padrão. Cartas sem impressão escolhida saem só com o nome (o importador decide).
function deckToText(deck: Deck): string {
  const cmd = deck.cards.filter((c) => c.is_commander)
  const rest = deck.cards.filter((c) => !c.is_commander).sort((a, b) => a.name.localeCompare(b.name))
  const line = (c: DeckCardRow) => {
    const p = c.printing
    const suffix = p?.set && p?.collector_number ? ` (${p.set.toUpperCase()}) ${p.collector_number}` : ''
    return `${c.qty} ${c.name}${suffix}`
  }
  return [...cmd, ...rest].map(line).join('\n') + '\n'
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

// Com mouse, ✕/⇄ aparecem no hover (ou foco de teclado); no toque ficam sempre visíveis.
const REVEAL = 'pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100'

type CardProps = {
  c: DeckCardRow
  onRemove: () => void
  onHover: (img: string | null) => void
  onPin: (img: string | null) => void
  onVersions: () => void
}

function CardLine({ c, onRemove, onHover, onPin, onVersions }: CardProps) {
  return (
    <div
      onMouseEnter={() => onHover(c.image)}
      onMouseLeave={() => onHover(null)}
      className="group flex items-center justify-between rounded px-2 py-0.5 text-sm hover:bg-surface-2"
    >
      <button onClick={() => onPin(c.image)} title="ver a carta" className={`truncate text-left hover:text-link ${c.is_commander ? 'text-accent' : ''}`}>
        {c.is_commander ? '★ ' : ''}
        {c.name}
        {c.qty > 1 ? ` ×${c.qty}` : ''}
      </button>
      <span className="flex items-center gap-1 text-xs text-muted shrink-0 pl-2">
        <ManaCost cost={c.mana_cost} />
        <span title={priceTip(c)} className="cursor-help px-1">{c.usd != null ? `$${c.usd.toFixed(2)}` : '—'}</span>
        <button onClick={onVersions} aria-label={`Versão / arte de ${c.name}`} title="versão / arte"
          className={`inline-flex h-7 w-7 items-center justify-center rounded hover:text-link ${c.printing ? 'text-accent' : REVEAL}`}>⇄</button>
        {!c.is_commander && (
          <button onClick={onRemove} aria-label={`Remover uma cópia de ${c.name}`} title="remover (−1)"
            className="inline-flex h-7 w-7 items-center justify-center rounded hover:text-red-400">✕</button>
        )}
      </span>
    </div>
  )
}

function CardTile({ c, onRemove, onHover, onPin, onVersions }: CardProps) {
  return (
    <div
      className="group relative rounded-lg overflow-hidden border border-border bg-surface-2"
      title={priceTip(c)}
      onMouseEnter={() => onHover(c.image)}
      onMouseLeave={() => onHover(null)}
    >
      <button onClick={() => onPin(c.image)} className="block w-full" aria-label={`Ver ${c.name}`}>
        <CardImage src={c.image} alt={c.name} className="w-full" />
      </button>
      {c.is_commander ? (
        <span className="absolute top-1 left-1 rounded bg-accent/90 px-1.5 py-0.5 text-xs font-bold text-bg">★</span>
      ) : c.qty > 1 ? (
        <span className="absolute top-1 left-1 rounded bg-bg/80 px-1.5 py-0.5 text-xs font-bold">×{c.qty}</span>
      ) : null}
      {!c.is_commander && (
        <button
          onClick={onRemove}
          aria-label={`Remover uma cópia de ${c.name}`}
          title="remover (−1)"
          className={`absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-bg/80 text-xs transition hover:text-red-400 ${REVEAL}`}
        >
          ✕
        </button>
      )}
      <div className={`pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-bg/90 to-transparent px-2 py-1 text-right text-xs transition ${REVEAL}`}>
        {c.usd != null ? `$${c.usd.toFixed(2)}` : '—'}
      </div>
      <button onClick={onVersions} aria-label={`Versão / arte de ${c.name}`} title="versão / arte"
        className={`absolute bottom-1 left-1 flex h-7 w-7 items-center justify-center rounded-full bg-bg/80 text-xs transition hover:text-link ${c.printing ? 'text-accent' : REVEAL}`}>
        ⇄
      </button>
    </div>
  )
}

// Marca na busca/sugestões: já no deck, fora da identidade do comandante, ilegal no Commander.
function cardFlags(c: CardSummary, inDeck: Set<string>, identity: string[] | null) {
  const flags: { text: string; cls: string }[] = []
  if (inDeck.has(c.name)) flags.push({ text: 'no deck', cls: 'text-green-400 border-green-500/40' })
  if (identity && (c.color_identity ?? []).some((x) => !identity.includes(x)))
    flags.push({ text: 'fora da cor', cls: 'text-amber-300 border-amber-500/40' })
  if (c.commander_legal && c.commander_legal !== 'legal')
    flags.push({ text: c.commander_legal === 'banned' ? 'banida' : 'não legal', cls: 'text-red-300 border-red-500/40' })
  return flags
}

function Flags({ flags }: { flags: { text: string; cls: string }[] }) {
  return (
    <>
      {flags.map((f) => (
        <span key={f.text} className={`rounded border px-1 text-xs leading-4 ${f.cls}`}>{f.text}</span>
      ))}
    </>
  )
}

export function DeckView() {
  const params = useParams()
  const id = Number(params.id)
  if (!Number.isInteger(id) || id <= 0) return <DeckNotFound />
  return <DeckViewInner key={id} id={id} />
}

function DeckNotFound() {
  return (
    <EmptyState icon="🂠" title="Deck não encontrado" hint="Esse link não aponta pra nenhum deck — ele pode ter sido excluído.">
      <Link to="/decks" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white">Ver meus decks</Link>
    </EmptyState>
  )
}

function DeckViewInner({ id }: { id: number }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const deckQ = useQuery({ queryKey: ['deck', id], queryFn: () => api.getDeck(id) })
  const deck = deckQ.data
  const analysisQ = useQuery({ queryKey: ['deck-analysis', id], queryFn: () => api.deckAnalysis(id), enabled: !!deck })
  const analysis = analysisQ.data
  const [q, setQ] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [hovered, setHovered] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; error: boolean } | null>(null)
  const [view, setView] = useState<'list' | 'grid'>('list')
  const [confirmDel, setConfirmDel] = useState(false)
  const [printingFor, setPrintingFor] = useState<DeckCardRow | null>(null)
  // ≥1280px há uma coluna só pro preview; abaixo disso o preview fixo cobria o conteúdo,
  // então lá a carta abre num modal ao clicar.
  const wide = useMediaQuery('(min-width: 1280px)')
  const search = useQuery({ queryKey: ['cardsearch', submitted], queryFn: () => api.searchCards(submitted), enabled: submitted.length > 0 })
  const suggestions = useQuery({ queryKey: ['suggest', id, deck?.commander], queryFn: () => api.suggest(deck!.commander!, id), enabled: !!deck?.commander })

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flash = (msg: string, error = false) => {
    setToast({ msg, error })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), error ? 5000 : 2800)
  }
  const fail = (e: Error) => flash(e.message, true)

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['deck', id] })
    qc.invalidateQueries({ queryKey: ['deck-analysis', id] })
    qc.invalidateQueries({ queryKey: ['suggest', id] })
    qc.invalidateQueries({ queryKey: ['decks'] })
  }
  const clearSearch = () => {
    setQ('')
    setSubmitted('')
  }
  const add = useMutation({
    mutationFn: (c: CardSummary) => api.addCard(id, c.name),
    onSuccess: (_r, c) => { refresh(); clearSearch(); flash(`${c.name} adicionada.`) },
    onError: fail,
  })
  const remove = useMutation({ mutationFn: (name: string) => api.removeCard(id, name), onSuccess: refresh, onError: fail })
  const del = useMutation({
    mutationFn: () => api.deleteDeck(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['decks'] })
      qc.removeQueries({ queryKey: ['deck', id] })
      navigate('/decks')
    },
    onError: fail,
  })
  const setPrint = useMutation({
    mutationFn: (p: Printing | null) => api.setPrinting(id, printingFor!.name, p),
    onSuccess: () => { refresh(); setPrintingFor(null) },
    onError: fail,
  })

  if (deckQ.isPending) return <Loading label="Carregando deck…" />
  if (deckQ.isError) {
    if (deckQ.error instanceof ApiError && deckQ.error.status === 404) return <DeckNotFound />
    return (
      <div className="space-y-3">
        <Link to="/decks" className="text-muted text-sm hover:text-text">← decks</Link>
        <ErrorState error={deckQ.error} title="Não consegui abrir o deck" onRetry={() => deckQ.refetch()} />
      </div>
    )
  }
  const d = deckQ.data

  const total = d.cards.reduce((s, c) => s + c.qty, 0)
  const tryAdd = (c: CardSummary) => {
    if (total >= 100) {
      flash('Deck cheio (100 cartas). Remova uma carta antes de adicionar outra.', true)
      return
    }
    add.mutate(c)
  }

  const commander = d.cards.find((c) => c.is_commander)
  const identity = commander ? commander.color_identity ?? [] : null
  const inDeck = new Set(d.cards.map((c) => c.name))
  const groups: Record<string, DeckCardRow[]> = {}
  for (const c of d.cards) (groups[bucket(c)] ??= []).push(c)
  // imagem fixada (clique) tem prioridade; senão, a do hover; na coluna larga, o comandante por padrão.
  const shown = pinned ?? hovered ?? commander?.image ?? null
  const cardProps = (c: DeckCardRow) => ({
    c,
    onRemove: () => remove.mutate(c.name),
    onHover: setHovered,
    onPin: setPinned,
    onVersions: () => setPrintingFor(c),
  })

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Link to="/decks" className="text-muted text-sm hover:text-text">← decks</Link>
        <div className="flex items-center gap-3">
          {d.cards.length > 0 && (
            <button
              onClick={() => downloadText(`${(d.name || 'deck').replace(/[/\\?%*:|"<>]/g, '').trim()}.txt`, deckToText(d))}
              title="baixar decklist .txt (Tabletop Simulator, Moxfield, Archidekt…)"
              className="text-xs text-muted hover:text-accent"
            >
              ⬇ Exportar .txt
            </button>
          )}
          {confirmDel ? (
            <span className="flex items-center gap-2 text-xs">
              <span className="text-muted">Excluir este deck?</span>
              <button onClick={() => del.mutate()} disabled={del.isPending} className="font-medium text-red-400 hover:text-red-300">
                {del.isPending ? 'Excluindo…' : 'Confirmar'}
              </button>
              <button onClick={() => setConfirmDel(false)} className="text-muted hover:text-text">cancelar</button>
            </span>
          ) : (
            <button onClick={() => setConfirmDel(true)} className="text-xs text-muted hover:text-red-400">🗑 excluir deck</button>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:flex-1 min-w-0">
          <div className="relative rounded-xl overflow-hidden border border-border mb-4 h-36">
            {commander?.art_crop && (
              <img src={commander.art_crop} alt="" className="absolute inset-0 w-full h-full object-cover" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/60 to-bg/10" />
            {commander?.image && (
              <button type="button" onClick={() => setPinned(commander.image)} aria-label={`Ver ${commander.name}`}
                title="ver o comandante" className="absolute inset-0 rounded-xl" />
            )}
            <div className="pointer-events-none absolute bottom-0 left-0 p-4">
              <h1 className="font-display text-2xl font-bold drop-shadow-lg">{d.name}</h1>
              <p className="text-accent text-sm">{d.commander ?? 'sem comandante'}</p>
              <p className="text-muted text-xs">
                {analysis?.total_cards ?? total} cartas ({d.cards.length} únicas)
              </p>
            </div>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); setSubmitted(q.trim()) }} className="flex gap-2 mb-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="buscar carta pra adicionar" aria-label="Buscar carta pra adicionar"
              className="flex-1 min-w-0 bg-surface border border-border-strong rounded-md px-3 py-2 text-sm focus:border-primary" />
            <button className="bg-primary text-white rounded-md px-3 py-2 text-sm">Buscar</button>
            {submitted && <button type="button" onClick={clearSearch} aria-label="Limpar busca" className="text-muted text-sm px-2 hover:text-text">✕</button>}
          </form>
          {submitted.length > 0 && (
            <div className="mb-4 max-h-56 overflow-y-auto bg-surface border border-border rounded-md divide-y divide-border">
              {search.isFetching ? (
                <div className="px-3 py-2"><Loading label="Buscando…" /></div>
              ) : search.isError ? (
                <p role="alert" className="px-3 py-2 text-sm text-red-400">Erro ao buscar: {search.error.message}</p>
              ) : (search.data?.length ?? 0) === 0 ? (
                <p className="px-3 py-2 text-sm text-muted">Nada encontrado pra "{submitted}".</p>
              ) : (
                search.data!.slice(0, 15).map((c) => (
                  <button key={c.id} disabled={add.isPending} onClick={() => tryAdd(c)} onMouseEnter={() => setHovered(c.image)} onMouseLeave={() => setHovered(null)}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-2 flex items-center justify-between gap-2 disabled:opacity-50">
                    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <span className="truncate">{c.name}</span>
                      <Flags flags={cardFlags(c, inDeck, identity)} />
                    </span>
                    <span className="text-muted text-xs shrink-0">{c.usd != null ? `$${c.usd.toFixed(2)} · ` : ''}+ add</span>
                  </button>
                ))
              )}
            </div>
          )}

          {d.cards.length === 0 && (
            <EmptyState icon="🂠" title="Deck vazio" hint="Busque cartas no campo acima pra começar a montar." />
          )}

          {d.cards.length > 0 && (
            <div className="mb-3 flex justify-end">
              <div className="inline-flex overflow-hidden rounded-md border border-border-strong text-xs" role="group" aria-label="Modo de exibição">
                <button onClick={() => setView('list')} aria-pressed={view === 'list'}
                  className={`px-3 py-1.5 ${view === 'list' ? 'bg-primary text-white' : 'text-muted hover:text-text'}`}>☰ Lista</button>
                <button onClick={() => setView('grid')} aria-pressed={view === 'grid'}
                  className={`px-3 py-1.5 ${view === 'grid' ? 'bg-primary text-white' : 'text-muted hover:text-text'}`}>▦ Grade</button>
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
                  {groups[t].map((c) => <CardLine key={c.name} {...cardProps(c)} />)}
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
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6">
                    {groups[t].map((c) => <CardTile key={c.name} {...cardProps(c)} />)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {suggestions.data && suggestions.data.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold mb-2">Sugestões pro {d.commander}</h3>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.data.slice(0, 18).map((c) => (
                  <button key={c.id} disabled={add.isPending} onClick={() => tryAdd(c)} onMouseEnter={() => setHovered(c.image)} onMouseLeave={() => setHovered(null)}
                    className="inline-flex items-center gap-1.5 text-xs bg-surface-2 rounded px-2 py-1 hover:bg-border disabled:opacity-50" title="adicionar ao deck">
                    + {c.name}
                    <Flags flags={cardFlags(c, inDeck, identity)} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* coluna do preview (só em telas largas): hover = espiada; clique = fixa */}
        {wide && (
          <div className="w-64 shrink-0">
            <div className="sticky top-20">
              {shown ? (
                <div className="relative">
                  <CardImage src={shown} alt="" className="w-full rounded-xl shadow-2xl border border-border" />
                  {pinned && (
                    <button onClick={() => setPinned(null)} aria-label="Soltar carta fixada"
                      className="absolute -top-2 -right-2 bg-surface border border-border-strong rounded-full w-7 h-7 text-xs hover:text-red-400">✕</button>
                  )}
                </div>
              ) : (
                <div className="flex aspect-[488/680] items-center justify-center rounded-xl border border-dashed border-border-strong p-4 text-center text-xs text-muted">
                  passe o mouse numa carta pra ver aqui
                </div>
              )}
            </div>
          </div>
        )}

        <div className="lg:w-80 xl:w-96 shrink-0 bg-surface border border-border rounded-lg p-4 h-fit">
          {analysisQ.isPending ? (
            <Loading label="Carregando análise…" />
          ) : analysisQ.isError ? (
            <ErrorState error={analysisQ.error} title="Não consegui analisar o deck" onRetry={() => analysisQ.refetch()} />
          ) : (
            <DeckAnalysis analysis={analysisQ.data} />
          )}
        </div>
      </div>

      {/* telas estreitas: a carta clicada abre num modal */}
      {!wide && pinned && (
        <Modal label="Carta" onClose={() => setPinned(null)} className="max-w-xs">
          <button onClick={() => setPinned(null)} aria-label="Fechar" className="block">
            <CardImage src={pinned} alt="" className="w-full rounded-xl shadow-2xl" />
          </button>
        </Modal>
      )}

      {toast && (
        <div role={toast.error ? 'alert' : 'status'}
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] w-max max-w-[calc(100vw-2rem)] bg-surface-2 border rounded-lg px-4 py-2 text-sm shadow-2xl ${
            toast.error ? 'border-red-500/60 text-red-200' : 'border-primary/50'}`}>
          {toast.msg}
        </div>
      )}

      {printingFor && (
        <PrintingPicker
          cardName={printingFor.name}
          current={printingFor.printing}
          onSelect={(p) => setPrint.mutate(p)}
          onClose={() => setPrintingFor(null)}
        />
      )}
    </div>
  )
}
