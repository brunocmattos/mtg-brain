import { useState, useEffect, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import CommanderCard from '../components/CommanderCard'
import CardDetailModal from '../components/CardDetailModal'

const COLORS = ['W', 'U', 'B', 'R', 'G']

export default function CardsPage() {
  const [mode, setMode] = useState<'keyword' | 'semantic'>('keyword')
  const [q, setQ] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [colors, setColors] = useState<string[]>([])
  const [sort, setSort] = useState('edhrec')
  const [selected, setSelected] = useState<string | null>(null)

  // busca ao vivo (sem precisar dar Enter)
  useEffect(() => {
    const t = setTimeout(() => setSubmitted(q.trim()), 350)
    return () => clearTimeout(t)
  }, [q])

  const semantic = mode === 'semantic'

  const { data, isLoading, error } = useQuery({
    queryKey: ['cards', mode, submitted, colors, sort],
    queryFn: () =>
      semantic ? api.semanticSearch(submitted, 60) : api.searchCards(submitted, colors, sort, 101),
    enabled: semantic ? submitted.length > 0 : submitted.length > 0 || colors.length > 0,
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(q.trim())
  }
  const toggle = (c: string) =>
    setColors((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]))

  const idle = semantic ? !submitted : !submitted && colors.length === 0

  return (
    <div>
      <h1 className="font-display text-2xl font-bold mb-1">Cartas</h1>
      <p className="text-muted text-sm mb-3">
        {semantic ? (
          <>
            Busca <strong>semântica</strong>: descreva o que procura em linguagem natural (ex.:{' '}
            <em>punish opponents for drawing cards</em>, <em>protect my board from a wrath</em>,{' '}
            <em>reanimate a big creature</em>) — acha por <em>significado</em>, não por palavra exata.
          </>
        ) : (
          <>
            Busque qualquer carta por nome ou texto (ex.: <em>Sol Ring</em>,{' '}
            <em>destroy target creature</em>) e filtre por cor.
          </>
        )}
      </p>

      {/* modo de busca */}
      <div className="mb-3 inline-flex overflow-hidden rounded-md border border-border text-sm">
        <button type="button" onClick={() => setMode('keyword')}
          className={`px-3 py-1.5 ${!semantic ? 'bg-surface-2 text-text' : 'text-muted'}`}>
          Texto
        </button>
        <button type="button" onClick={() => setMode('semantic')}
          className={`px-3 py-1.5 ${semantic ? 'bg-surface-2 text-text' : 'text-muted'}`}>
          Semântica ✨
        </button>
      </div>

      <form onSubmit={submit} className="flex flex-wrap items-center gap-2 mb-5">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={semantic ? 'descreva o que a carta faz…' : 'nome ou texto da carta'}
          className="bg-surface border border-border rounded-md px-3 py-2 text-sm flex-1 min-w-44 outline-none focus:border-primary"
        />
        {!semantic && (
          <>
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
            <select value={sort} onChange={(e) => setSort(e.target.value)} title="Ordenar"
              className="bg-surface border border-border rounded-md px-2 py-2 text-sm outline-none">
              <option value="edhrec">Popularidade</option>
              <option value="price_asc">Preço ↑</option>
              <option value="price_desc">Preço ↓</option>
              <option value="cmc_asc">CMC ↑</option>
              <option value="cmc_desc">CMC ↓</option>
              <option value="name">Nome</option>
            </select>
          </>
        )}
        <button className="bg-primary text-white rounded-md px-4 py-2 text-sm font-medium">Buscar</button>
      </form>

      {idle && (
        <p className="text-muted text-sm">
          {semantic ? 'Descreva o que você procura.' : 'Digite algo (ou escolha cores) e busque.'}
        </p>
      )}
      {isLoading && <p className="text-muted">Carregando…</p>}
      {error && <p className="text-red-400">Erro ao buscar.</p>}
      {data && data.length === 0 && <p className="text-muted">Nada encontrado.</p>}
      {data && data.length > 0 && (
        <p className="text-muted text-xs mb-2">
          {semantic
            ? `${data.length} carta(s) por relevância`
            : data.length > 100
              ? 'mais de 100 cartas (mostrando as 100 primeiras)'
              : `${data.length} carta(s)`}
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {data?.slice(0, 100).map((c) => (
          <CommanderCard key={c.id} c={c} onClick={() => setSelected(c.id)} />
        ))}
      </div>

      {selected && <CardDetailModal id={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
