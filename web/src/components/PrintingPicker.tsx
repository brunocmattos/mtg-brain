import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import type { Printing } from '../api'

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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const { data, isLoading, error } = useQuery({
    queryKey: ['printings', cardName],
    queryFn: () => api.cardPrintings(cardName),
    staleTime: 60 * 60 * 1000,
  })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div role="dialog" aria-modal="true" aria-label="Escolher versão"
        className="flex w-full max-w-4xl max-h-[88vh] flex-col rounded-xl border border-border bg-bg">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="font-display text-lg">Versão / arte — <span className="text-accent">{cardName}</span></h2>
          <button onClick={onClose} aria-label="Fechar" className="text-sm text-muted hover:text-text">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && <p className="text-sm text-muted">Carregando versões…</p>}
          {error && <p className="text-sm text-red-400">Erro ao buscar versões.</p>}
          {data && data.length === 0 && <p className="text-sm text-muted">Nenhuma impressão encontrada.</p>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            <button
              onClick={() => onSelect(null)}
              className={`flex aspect-[0.716] flex-col items-center justify-center rounded-lg border p-3 text-center text-xs ${
                !current ? 'border-accent ring-2 ring-accent' : 'border-border hover:border-primary'
              }`}
            >
              <span className="text-text">Padrão</span>
              <span className="text-[10px] text-muted">(mais barata)</span>
            </button>
            {data?.map((p) => (
              <button
                key={p.scryfall_id}
                onClick={() => onSelect(p)}
                className={`overflow-hidden rounded-lg border ${
                  current?.scryfall_id === p.scryfall_id ? 'border-accent ring-2 ring-accent' : 'border-border hover:border-primary'
                }`}
              >
                {p.image ? (
                  <img src={p.image} alt={p.set_name} loading="lazy" className="block w-full" />
                ) : (
                  <div className="flex aspect-[0.716] items-center justify-center p-2 text-center text-xs text-muted">{p.set_name}</div>
                )}
                <div className="px-1.5 py-1 text-[10px] text-muted">
                  <div className="truncate" title={p.set_name}>{(p.set ?? '').toUpperCase()} · #{p.collector_number}</div>
                  <div className="text-accent">{p.usd ? `$${p.usd}` : '—'}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
