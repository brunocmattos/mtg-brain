import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import type { Printing } from '../api'
import CardImage from './CardImage'
import Modal from './Modal'
import { ErrorState, Loading } from './States'

// Escolhe a versão/arte (e preço) de uma carta. As impressões vêm do Scryfall sob demanda.
export default function PrintingPicker({
  cardName,
  current,
  onSelect,
  onClose,
}: {
  cardName: string
  current: Printing | null
  onSelect: (p: Printing | null) => void
  onClose: () => void
}) {

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['printings', cardName],
    queryFn: () => api.cardPrintings(cardName),
    staleTime: 60 * 60 * 1000,
  })

  return (
    <Modal label={`Versão / arte — ${cardName}`} onClose={onClose} className="max-w-4xl rounded-xl border border-border bg-bg">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="font-display text-lg">Versão / arte — <span className="text-accent">{cardName}</span></h2>
          <button onClick={onClose} aria-label="Fechar" className="text-sm text-muted hover:text-text">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && <Loading label="Carregando versões…" />}
          {error && <ErrorState error={error} title="Erro ao buscar versões" onRetry={() => refetch()} />}
          {data && data.length === 0 && <p className="text-sm text-muted">Nenhuma impressão encontrada.</p>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            <button
              onClick={() => onSelect(null)}
              aria-pressed={!current}
              className={`flex aspect-[488/680] flex-col items-center justify-center rounded-lg border p-3 text-center text-xs ${
                !current ? 'border-accent ring-2 ring-accent' : 'border-border hover:border-primary'
              }`}
            >
              <span className="text-text">Padrão</span>
              <span className="text-xs text-muted">(mais barata)</span>
            </button>
            {data?.map((p) => (
              <button
                key={p.scryfall_id}
                onClick={() => onSelect(p)}
                aria-pressed={current?.scryfall_id === p.scryfall_id}
                className={`overflow-hidden rounded-lg border ${
                  current?.scryfall_id === p.scryfall_id ? 'border-accent ring-2 ring-accent' : 'border-border hover:border-primary'
                }`}
              >
                <CardImage src={p.image} alt={p.set_name} className="w-full" />
                <div className="px-1.5 py-1 text-xs text-muted">
                  <div className="truncate" title={p.set_name}>{(p.set ?? '').toUpperCase()} · #{p.collector_number}</div>
                  <div className="text-accent">{p.usd ? `$${p.usd}` : '—'}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
    </Modal>
  )
}
