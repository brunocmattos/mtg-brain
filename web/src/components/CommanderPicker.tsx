import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../api'
import type { CardSummary } from '../api'
import CommanderCard from './CommanderCard'
import { ColorFilter } from './Mana'
import Modal from './Modal'
import { ErrorState, Loading } from './States'

const CMC_OPTS = [
  { v: '', label: 'CMC: qualquer' },
  { v: '0-2', label: 'CMC 0–2' },
  { v: '3-4', label: 'CMC 3–4' },
  { v: '5+', label: 'CMC 5+' },
]
// faixa [min, max] por bucket — filtro vai pro servidor (senão só filtraria a página de 100)
const CMC_RANGE: Record<string, [number | undefined, number | undefined]> = {
  '': [undefined, undefined],
  '0-2': [undefined, 2],
  '3-4': [3, 4],
  '5+': [5, undefined],
}

// Modal de SELEÇÃO de comandante: filtra, clica numa carta (seleciona) e confirma.
// O comandante define a identidade de cor do deck — por isso o filtro de cores
// vive aqui (na escolha do comandante), não na criação do deck.
export default function CommanderPicker({
  onSelect,
  onClose,
}: {
  onSelect: (name: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [colors, setColors] = useState<string[]>([])
  const [cmc, setCmc] = useState('')
  const [sort, setSort] = useState('edhrec')
  const [picked, setPicked] = useState<CardSummary | null>(null)


  // busca ao vivo: filtra ~350ms depois de parar de digitar (Enter também funciona)
  useEffect(() => {
    const t = setTimeout(() => setSubmitted(q.trim()), 350)
    return () => clearTimeout(t)
  }, [q])

  const [cmcMin, cmcMax] = CMC_RANGE[cmc] ?? [undefined, undefined]
  const { data, isLoading, error, refetch, isPlaceholderData } = useQuery({
    queryKey: ['picker-commanders', submitted, colors, sort, cmc],
    placeholderData: keepPreviousData,
    queryFn: () =>
      submitted
        ? api.recommendCommanders(submitted, colors, undefined, sort, cmcMin, cmcMax)
        : api.listCommanders(colors, undefined, sort, cmcMin, cmcMax),
  })

  const filtered = data ?? []

  // só confirma se a carta escolhida ainda está visível com os filtros atuais
  const pickedVisible = !!picked && filtered.some((c) => c.id === picked.id)

  return (
    <Modal label="Escolher comandante" onClose={onClose} className="max-w-5xl rounded-xl border border-border bg-bg">
        {/* filtros */}
        <div className="border-b border-border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl">Escolher comandante</h2>
            <button onClick={onClose} aria-label="Fechar" className="text-sm text-muted hover:text-text">✕</button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setSubmitted(q.trim())
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="tema ou nome (ex.: vampire, Meren)"
              aria-label="Tema ou nome do comandante"
              className="min-w-44 flex-1 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm focus:border-primary"
            />
            <ColorFilter value={colors} onChange={setColors} />
            <select
              value={cmc}
              onChange={(e) => setCmc(e.target.value)}
              aria-label="Custo de mana"
              className="rounded-md border border-border-strong bg-surface px-2 py-2 text-sm"
            >
              {CMC_OPTS.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              aria-label="Ordenar"
              className="rounded-md border border-border-strong bg-surface px-2 py-2 text-sm"
            >
              <option value="edhrec">Popularidade</option>
              <option value="price_asc">Preço ↑</option>
              <option value="price_desc">Preço ↓</option>
              <option value="cmc_asc">CMC ↑</option>
              <option value="cmc_desc">CMC ↓</option>
              <option value="name">Nome</option>
            </select>
            {submitted && (
              <button
                type="button"
                onClick={() => {
                  setQ('')
                  setSubmitted('')
                }}
                className="px-2 text-sm text-muted hover:text-text"
              >
                limpar tema
              </button>
            )}
          </form>
        </div>

        {/* grade de comandantes */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && <Loading />}
          {error && <ErrorState error={error} title="Erro ao buscar comandantes" onRetry={() => refetch()} />}
          {data && filtered.length === 0 && <p className="text-sm text-muted">Nada encontrado com esses filtros.</p>}
          <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`}>
            {filtered.map((c) => (
              <div key={c.id} className={picked?.id === c.id ? 'rounded-lg ring-2 ring-accent' : ''}>
                <CommanderCard c={c} pressed={picked?.id === c.id} onClick={() => setPicked(c)} />
              </div>
            ))}
          </div>
        </div>

        {/* rodapé: seleção + confirmar */}
        <div className="flex items-center justify-between border-t border-border p-4">
          <div className="min-w-0 truncate text-sm text-muted">
            {pickedVisible ? (
              <>
                Selecionado: <span className="text-accent">{picked!.name}</span>
              </>
            ) : (
              'Clique numa carta pra selecionar.'
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <button onClick={onClose} className="px-3 text-sm text-muted hover:text-text">
              Cancelar
            </button>
            <button
              disabled={!pickedVisible}
              onClick={() => pickedVisible && onSelect(picked!.name)}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50"
            >
              Confirmar
            </button>
          </div>
        </div>
    </Modal>
  )
}
