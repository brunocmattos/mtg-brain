import type { CardSummary } from '../api'
import CardImage from './CardImage'

const PIP: Record<string, string> = {
  W: '#f4f1d8',
  U: '#1f6dab',
  B: '#2b2230',
  R: '#d3202a',
  G: '#1a7b48',
}

export default function CommanderCard({
  c,
  onClick,
}: {
  c: CardSummary
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="text-left bg-surface rounded-lg overflow-hidden border border-border hover:border-primary transition group"
    >
      <CardImage src={c.image} alt={c.name} className="w-full object-cover group-hover:opacity-95" />
      <div className="p-2.5">
        <div className="font-medium text-sm leading-tight line-clamp-2">{c.name}</div>
        <div className="flex items-center justify-between mt-1.5 text-xs text-muted">
          <div className="flex gap-1">
            {(c.color_identity ?? []).map((col) => (
              <span
                key={col}
                title={col}
                className="w-3.5 h-3.5 rounded-full border border-border"
                style={{ background: PIP[col] ?? '#888' }}
              />
            ))}
          </div>
          <span className="text-accent">{c.usd != null ? `$${c.usd.toFixed(2)}` : '—'}</span>
        </div>
      </div>
    </button>
  )
}
