import { useState, useEffect, type FormEvent } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../api'
import CommanderCard from '../components/CommanderCard'
import CardDetailModal from '../components/CardDetailModal'
import { ColorFilter } from '../components/Mana'
import { EmptyState, ErrorState, Loading } from '../components/States'

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

  const { data, isLoading, error, refetch, isPlaceholderData } = useQuery({
    queryKey: ['cards', mode, submitted, colors, sort],
    placeholderData: keepPreviousData,
    queryFn: () =>
      semantic ? api.semanticSearch(submitted, 60) : api.searchCards(submitted, colors, sort, 101),
    enabled: semantic ? submitted.length > 0 : submitted.length > 0 || colors.length > 0,
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(q.trim())
  }

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
        <button type="button" onClick={() => setMode('keyword')} aria-pressed={!semantic}
          className={`px-3 py-1.5 ${!semantic ? 'bg-surface-2 text-text' : 'text-muted'}`}>
          Texto
        </button>
        <button type="button" onClick={() => setMode('semantic')} aria-pressed={semantic}
          className={`px-3 py-1.5 ${semantic ? 'bg-surface-2 text-text' : 'text-muted'}`}>
          Semântica ✨
        </button>
      </div>

      <form onSubmit={submit} className="flex flex-wrap items-center gap-2 mb-5">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={semantic ? 'descreva o que a carta faz…' : 'nome ou texto da carta'}
          aria-label={semantic ? 'Descrição do que a carta faz' : 'Nome ou texto da carta'}
          className="bg-surface border border-border-strong rounded-md px-3 py-2 text-sm flex-1 min-w-44 focus:border-primary"
        />
        {!semantic && (
          <>
            <ColorFilter value={colors} onChange={setColors} />
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Ordenar"
              className="bg-surface border border-border-strong rounded-md px-2 py-2 text-sm">
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
        <EmptyState
          icon={semantic ? '✨' : '🔍'}
          title={semantic ? 'Descreva o que você procura' : 'Busque uma carta'}
          hint={semantic ? 'Ex.: “draw a card whenever a creature dies”.' : 'Digite um nome ou trecho de texto, ou escolha cores.'}
        />
      )}
      {!idle && isLoading && <Loading />}
      {!idle && error && <ErrorState error={error} title="Erro ao buscar cartas" onRetry={() => refetch()} />}
      {!idle && data && data.length === 0 && (
        <EmptyState icon="🔍" title="Nada encontrado" hint="Confira a grafia ou tente a busca semântica." />
      )}
      {!idle && data && data.length > 0 && (
        <p className="text-muted text-xs mb-2">
          {semantic
            ? `${data.length} carta(s) por relevância`
            : data.length > 100
              ? 'mais de 100 cartas (mostrando as 100 primeiras)'
              : `${data.length} carta(s)`}
        </p>
      )}

      <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3 transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`}>
        {!idle && data?.slice(0, 100).map((c) => (
          <CommanderCard key={c.id} c={c} onClick={() => setSelected(c.id)} />
        ))}
      </div>

      {selected && <CardDetailModal id={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
