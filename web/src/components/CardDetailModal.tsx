import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import type { Combo } from '../api'
import CardImage from './CardImage'
import { ManaCost, OracleText } from './Mana'

function ComboItem({ combo }: { combo: Combo }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="bg-surface-2 rounded">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left p-2 text-xs flex items-start gap-2 hover:bg-border/40"
      >
        <span className="text-muted mt-0.5">{open ? '▾' : '▸'}</span>
        <span className="min-w-0">
          <span className="text-text">{combo.card_names.join(' + ')}</span>
          <span className="text-muted"> · {combo.results.length} resultado(s)</span>
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-2 text-xs space-y-2 border-t border-border">
          <div>
            <span className="text-accent">Cartas:</span> {combo.card_names.join(', ')}
          </div>
          {combo.prerequisites && (
            <div>
              <span className="text-accent">Pré-requisitos:</span> {combo.prerequisites}
            </div>
          )}
          {combo.steps && (
            <div>
              <span className="text-accent">Passos:</span>{' '}
              <span className="whitespace-pre-wrap">{combo.steps}</span>
            </div>
          )}
          <div>
            <span className="text-accent">Produz:</span> {combo.results.join(', ')}
          </div>
          <a
            href={`https://commanderspellbook.com/combo/${combo.id}/`}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline inline-block"
          >
            Ver no Commander Spellbook ↗
          </a>
        </div>
      )}
    </li>
  )
}

export default function CardDetailModal({
  id,
  onClose,
}: {
  id: string
  onClose: () => void
}) {
  const { data: card, isError } = useQuery({ queryKey: ['card', id], queryFn: () => api.card(id) })
  const { data: combos } = useQuery({
    queryKey: ['combos', card?.name],
    queryFn: () => api.combosForCard(card!.name),
    enabled: !!card?.name,
  })

  // Esc fecha; trava o scroll do fundo
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

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-20"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-surface border border-border rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {isError ? (
          <div className="p-8 flex items-start justify-between gap-2">
            <span className="text-red-400 text-sm">Erro ao carregar a carta.</span>
            <button onClick={onClose} className="text-muted hover:text-text text-lg leading-none">✕</button>
          </div>
        ) : !card ? (
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
              <div className="text-sm mt-1 flex items-center gap-1.5 flex-wrap">
                <ManaCost cost={card.mana_cost} />
                <span>· EDHREC #{card.edhrec_rank ?? '—'} ·</span>
                <span className="text-accent">
                  {card.usd != null ? `$${card.usd.toFixed(2)}` : 's/ preço'}
                </span>
              </div>
              <p className="text-sm mt-3">
                <OracleText text={card.oracle_text} />
              </p>

              <h3 className="text-accent text-sm font-semibold mt-4 mb-1">
                Combos ({combos?.length ?? 0}) {combos && combos.length > 0 && (
                  <span className="text-muted font-normal">— clique pra abrir</span>
                )}
              </h3>
              <ul className="space-y-1.5">
                {combos?.map((cb) => <ComboItem key={cb.id} combo={cb} />)}
                {combos && combos.length === 0 && (
                  <li className="text-xs text-muted">
                    Sem combos catalogados pra esta carta no Commander Spellbook (normal — nem toda
                    carta é peça de combo).
                  </li>
                )}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
