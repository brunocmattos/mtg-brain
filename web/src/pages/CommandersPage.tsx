import { useState, useEffect, type FormEvent } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../api'
import CommanderCard from '../components/CommanderCard'
import CardDetailModal from '../components/CardDetailModal'
import { ColorFilter } from '../components/Mana'
import { EmptyState, ErrorState, Loading } from '../components/States'
import { useDebounced } from '../hooks'

export default function CommandersPage() {
  const [theme, setTheme] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [colors, setColors] = useState<string[]>([])
  const [maxPrice, setMaxPrice] = useState('')
  const [sort, setSort] = useState('edhrec')
  const [selected, setSelected] = useState<string | null>(null)

  // só manda o filtro se for um número válido (evita 422 com "1.2.3" ou NaN com ".")
  // debounce: sem ele cada tecla do preço disparava uma busca
  const maxPriceDeb = useDebounced(maxPrice)
  const price = maxPriceDeb && Number.isFinite(Number(maxPriceDeb)) ? Number(maxPriceDeb) : undefined

  // busca ao vivo (sem precisar dar Enter)
  useEffect(() => {
    const t = setTimeout(() => setSubmitted(theme.trim()), 350)
    return () => clearTimeout(t)
  }, [theme])

  const { data, isLoading, error, refetch, isPlaceholderData } = useQuery({
    queryKey: ['commanders', submitted, colors, price, sort],
    placeholderData: keepPreviousData,
    queryFn: () =>
      submitted
        ? api.recommendCommanders(submitted, colors, price, sort)
        : api.listCommanders(colors, price, sort),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(theme.trim())
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold mb-1">Comandantes</h1>
      <p className="text-muted text-sm mb-4">
        Por padrão, os mais jogados (rank EDHREC). Busque um tema (ex.: <em>vampire</em>,{' '}
        <em>zombie</em>, <em>sacrifice</em>) ou filtre por cor e preço.
      </p>

      <form onSubmit={submit} className="flex flex-wrap items-center gap-2 mb-5">
        <input
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          placeholder="tema (opcional)"
          aria-label="Tema"
          className="bg-surface border border-border-strong rounded-md px-3 py-2 text-sm flex-1 min-w-44 focus:border-primary"
        />
        <ColorFilter value={colors} onChange={setColors} />
        <input
          value={maxPrice}
          onChange={(e) => setMaxPrice(e.target.value.replace(/[^0-9.]/g, ''))}
          placeholder="máx US$"
          aria-label="Preço máximo em US$"
          inputMode="decimal"
          className="bg-surface border border-border-strong rounded-md px-3 py-2 text-sm w-24 focus:border-primary"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          aria-label="Ordenar"
          className="bg-surface border border-border-strong rounded-md px-2 py-2 text-sm"
        >
          <option value="edhrec">Popularidade</option>
          <option value="price_asc">Preço ↑</option>
          <option value="price_desc">Preço ↓</option>
          <option value="cmc_asc">CMC ↑</option>
          <option value="cmc_desc">CMC ↓</option>
          <option value="name">Nome</option>
        </select>
        <button className="bg-primary text-white rounded-md px-4 py-2 text-sm font-medium">Buscar</button>
        {submitted && (
          <button
            type="button"
            onClick={() => {
              setTheme('')
              setSubmitted('')
            }}
            className="text-muted text-sm hover:text-text"
          >
            limpar tema
          </button>
        )}
      </form>

      {isLoading && <Loading />}
      {error && <ErrorState error={error} title="Erro ao buscar comandantes" onRetry={() => refetch()} />}
      {data && data.length === 0 && (
        <EmptyState icon="🔍" title="Nenhum comandante com esses filtros" hint="Tente outro tema, menos cores ou um preço máximo maior." />
      )}
      {data && data.length > 0 && (
        <p className="text-muted text-xs mb-2">{data.length} comandante(s)</p>
      )}

      <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3 transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`}>
        {data?.map((c) => (
          <CommanderCard key={c.id} c={c} onClick={() => setSelected(c.id)} />
        ))}
      </div>

      {selected && <CardDetailModal id={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
