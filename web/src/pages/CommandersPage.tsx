import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import CommanderCard from '../components/CommanderCard'
import CardDetailModal from '../components/CardDetailModal'

const COLORS = ['W', 'U', 'B', 'R', 'G']

export default function CommandersPage() {
  const [theme, setTheme] = useState('vampire')
  const [submitted, setSubmitted] = useState('vampire')
  const [colors, setColors] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['recommend', submitted, colors],
    queryFn: () => api.recommendCommanders(submitted, colors),
    enabled: submitted.length > 0,
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(theme.trim())
  }

  function toggle(c: string) {
    setColors((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]))
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">Quero jogar com um comandante…</h1>
      <p className="text-muted text-sm mb-4">
        Diga um tema (ex.: <em>vampire</em>, <em>zombie</em>, <em>dragon</em>, <em>sacrifice</em>,{' '}
        <em>lifegain</em>) e filtre por cor.
      </p>

      <form onSubmit={submit} className="flex flex-wrap gap-2 mb-5">
        <input
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          placeholder="tema do comandante"
          className="bg-surface border border-border rounded-md px-3 py-2 text-sm flex-1 min-w-48 outline-none focus:border-primary"
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
        <button className="bg-primary text-white rounded-md px-4 py-2 text-sm font-medium">
          Buscar
        </button>
      </form>

      {isLoading && <p className="text-muted">Procurando comandantes…</p>}
      {error && <p className="text-red-400">Erro ao buscar. O backend está rodando em :8000?</p>}
      {data && data.length === 0 && (
        <p className="text-muted">Nada encontrado pra "{submitted}".</p>
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
