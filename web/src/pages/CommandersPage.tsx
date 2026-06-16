import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import CommanderCard from '../components/CommanderCard'
import CardDetailModal from '../components/CardDetailModal'

const COLORS = ['W', 'U', 'B', 'R', 'G']

export default function CommandersPage() {
  const [theme, setTheme] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [colors, setColors] = useState<string[]>([])
  const [maxPrice, setMaxPrice] = useState('')
  const [sort, setSort] = useState('edhrec')
  const [selected, setSelected] = useState<string | null>(null)

  const price = maxPrice ? Number(maxPrice) : undefined

  const { data, isLoading, error } = useQuery({
    queryKey: ['commanders', submitted, colors, price, sort],
    queryFn: () =>
      submitted
        ? api.recommendCommanders(submitted, colors, price)
        : api.listCommanders(colors, price, sort),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(theme.trim())
  }
  const toggle = (c: string) =>
    setColors((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]))

  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">Comandantes</h1>
      <p className="text-muted text-sm mb-4">
        Por padrão, os mais jogados (rank EDHREC). Busque um tema (ex.: <em>vampire</em>,{' '}
        <em>zombie</em>, <em>sacrifice</em>) ou filtre por cor e preço.
      </p>

      <form onSubmit={submit} className="flex flex-wrap items-center gap-2 mb-5">
        <input
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          placeholder="tema (opcional)"
          className="bg-surface border border-border rounded-md px-3 py-2 text-sm flex-1 min-w-44 outline-none focus:border-primary"
        />
        <div className="flex gap-1">
          {COLORS.map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => toggle(c)}
              className={`w-9 h-9 rounded-md border text-sm font-bold ${
                colors.includes(c) ? 'border-accent bg-surface-2 text-text' : 'border-border text-muted'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <input
          value={maxPrice}
          onChange={(e) => setMaxPrice(e.target.value.replace(/[^0-9.]/g, ''))}
          placeholder="máx US$"
          inputMode="decimal"
          className="bg-surface border border-border rounded-md px-3 py-2 text-sm w-24 outline-none focus:border-primary"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          disabled={!!submitted}
          title={submitted ? 'Ordenação fixa no modo tema' : 'Ordenar'}
          className="bg-surface border border-border rounded-md px-2 py-2 text-sm outline-none disabled:opacity-50"
        >
          <option value="edhrec">Rank EDH</option>
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

      {isLoading && <p className="text-muted">Carregando…</p>}
      {error && <p className="text-red-400">Erro ao buscar. O backend está rodando em :8000?</p>}
      {data && data.length === 0 && <p className="text-muted">Nada encontrado.</p>}
      {data && data.length > 0 && (
        <p className="text-muted text-xs mb-2">
          {data.length} comandante(s) — ordenados por popularidade (EDHREC)
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {data?.map((c) => (
          <CommanderCard key={c.id} c={c} onClick={() => setSelected(c.id)} />
        ))}
      </div>

      {selected && <CardDetailModal id={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
