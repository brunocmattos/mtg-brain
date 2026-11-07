import type { CardSummary } from '../api'
import CardImage from './CardImage'
import { ColorPips } from './Mana'

export default function CommanderCard({
  c,
  onClick,
  pressed,
}: {
  c: CardSummary
  onClick: () => void
  pressed?: boolean
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={pressed}
      className="w-full text-left bg-surface rounded-lg overflow-hidden border border-border hover:border-primary transition group"
    >
      <CardImage src={c.image} alt={c.name} className="w-full group-hover:opacity-95" />
      <div className="p-2.5">
        <div className="font-medium text-sm leading-tight line-clamp-2">{c.name}</div>
        <div className="flex items-center justify-between mt-1.5 text-xs text-muted">
          <ColorPips colors={c.color_identity ?? []} className="h-3.5 w-3.5" />
          <span className="text-accent">{c.usd != null ? `$${c.usd.toFixed(2)}` : '—'}</span>
        </div>
      </div>
    </button>
  )
}
