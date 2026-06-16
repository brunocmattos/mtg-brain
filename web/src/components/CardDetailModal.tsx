import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import CardImage from './CardImage'

export default function CardDetailModal({
  id,
  onClose,
}: {
  id: string
  onClose: () => void
}) {
  const { data: card } = useQuery({ queryKey: ['card', id], queryFn: () => api.card(id) })
  const { data: combos } = useQuery({
    queryKey: ['combos', card?.name],
    queryFn: () => api.combosForCard(card!.name),
    enabled: !!card?.name,
  })

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-20"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {!card ? (
          <div className="p-8 text-muted">Carregando…</div>
        ) : (
          <div className="flex flex-col md:flex-row gap-4 p-4">
            <CardImage
              src={card.image_large ?? card.image}
              alt={card.name}
              className="rounded-lg w-full md:w-64 shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-lg font-semibold">{card.name}</h2>
                <button onClick={onClose} className="text-muted hover:text-text text-lg leading-none">
                  ✕
                </button>
              </div>
              <div className="text-sm text-muted">{card.type_line}</div>
              <div className="text-sm mt-1">
                {card.mana_cost} · EDHREC #{card.edhrec_rank ?? '—'} ·{' '}
                <span className="text-accent">
                  {card.usd != null ? `$${card.usd.toFixed(2)}` : 's/ preço'}
                </span>
              </div>
              <p className="text-sm mt-3 whitespace-pre-wrap">{card.oracle_text}</p>

              <h3 className="text-accent text-sm font-semibold mt-4 mb-1">
                Combos ({combos?.length ?? 0})
              </h3>
              <ul className="space-y-1.5">
                {combos?.slice(0, 12).map((cb) => (
                  <li key={cb.id} className="text-xs bg-surface-2 rounded p-2">
                    <span className="text-text">{cb.card_names.join(' + ')}</span>
                    <span className="text-muted"> → {cb.results.slice(0, 4).join(', ')}</span>
                  </li>
                ))}
                {combos && combos.length === 0 && (
                  <li className="text-xs text-muted">Sem combos catalogados pra esta carta.</li>
                )}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
