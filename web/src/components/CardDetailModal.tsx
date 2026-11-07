import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import type { Combo } from '../api'
import CardImage from './CardImage'
import { ManaCost, OracleText } from './Mana'
import Modal from './Modal'
import { ErrorState, Loading } from './States'

function ComboItem({ combo, selfName }: { combo: Combo; selfName: string }) {
  const [open, setOpen] = useState(false)
  // não repete a própria carta — mostra só as OUTRAS peças do combo
  const others = combo.card_names.filter((n) => n !== selfName)
  const label = others.length ? others.join(' + ') : combo.card_names.join(' + ')
  return (
    <li className="bg-surface-2 rounded">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left p-2 text-xs flex items-start gap-2 hover:bg-border/40"
      >
        <span className="text-muted mt-0.5 shrink-0">{open ? '▾' : '▸'}</span>
        <span className="min-w-0 flex-1">
          <span className="text-muted">+ </span>
          <span className="text-text">{label}</span>
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
            className="text-link hover:underline inline-block"
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
  const { data: card, error, refetch } = useQuery({ queryKey: ['card', id], queryFn: () => api.card(id) })
  const combos = useQuery({
    queryKey: ['combos', card?.name],
    queryFn: () => api.combosForCard(card!.name),
    enabled: !!card?.name,
  })

  return (
    <Modal label={card?.name ?? 'Carta'} onClose={onClose} className="max-w-3xl rounded-xl border border-border bg-surface">
        {error ? (
          <div className="p-6 flex items-start justify-between gap-3">
            <div className="flex-1"><ErrorState error={error} title="Erro ao carregar a carta" onRetry={() => refetch()} /></div>
            <button onClick={onClose} aria-label="Fechar" className="text-muted hover:text-text text-lg leading-none">✕</button>
          </div>
        ) : !card ? (
          <div className="p-8"><Loading /></div>
        ) : (
          <>
            {/* cabeçalho fixo */}
            <div className="flex items-start justify-between gap-2 border-b border-border p-4 shrink-0">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold truncate">{card.name}</h2>
                <div className="text-sm text-muted">{card.type_line}</div>
              </div>
              <button onClick={onClose} aria-label="Fechar" className="text-muted hover:text-text text-lg leading-none shrink-0">✕</button>
            </div>

            {/* corpo: imagem+oráculo | combos (cada coluna rola sozinha no desktop) */}
            <div className="flex flex-col md:flex-row gap-4 p-4 flex-1 min-h-0 overflow-y-auto md:overflow-hidden">
              <div className="md:w-64 shrink-0 md:overflow-y-auto">
                <CardImage src={card.image_large ?? card.image} alt={card.name} className="rounded-lg w-full" />
                <div className="text-sm mt-2 flex items-center gap-1.5 flex-wrap">
                  <ManaCost cost={card.mana_cost} />
                  <span>· EDHREC #{card.edhrec_rank ?? '—'} ·</span>
                  <span className="text-accent">{card.usd != null ? `$${card.usd.toFixed(2)}` : 's/ preço'}</span>
                </div>
                <p className="text-sm mt-2">
                  <OracleText text={card.oracle_text} />
                </p>
              </div>

              <div className="flex-1 min-w-0 md:overflow-y-auto">
                <h3 className="text-accent text-sm font-semibold mb-1">
                  Combos{combos.data ? ` (${combos.data.length})` : ''}{' '}
                  {combos.data && combos.data.length > 0 && <span className="text-muted font-normal">— clique pra abrir</span>}
                </h3>
                {combos.isPending ? (
                  <Loading label="Buscando combos…" />
                ) : combos.isError ? (
                  <ErrorState error={combos.error} title="Erro ao buscar combos" onRetry={() => combos.refetch()} />
                ) : (
                  <ul className="space-y-1.5">
                    {combos.data.map((cb) => <ComboItem key={cb.id} combo={cb} selfName={card.name} />)}
                    {combos.data.length === 0 && (
                      <li className="text-xs text-muted">
                        Sem combos catalogados pra esta carta no Commander Spellbook (normal — nem toda carta é peça de combo).
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
    </Modal>
  )
}
