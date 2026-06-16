import { useState } from 'react'
import type { DeckAnalysisData, DeckCombo, Health } from '../api'

const CURVE_KEYS = ['0', '1', '2', '3', '4', '5', '6', '7+']
const PIP: Record<string, string> = {
  W: '#f4f1d8',
  U: '#1f6dab',
  B: '#2b2230',
  R: '#d3202a',
  G: '#1a7b48',
}
const BRACKET_COLOR: Record<number, string> = {
  2: 'text-green-400',
  3: 'text-sky-400',
  4: 'text-amber-400',
  5: 'text-red-400',
}

function Pips({ colors }: { colors: string[] }) {
  if (colors.length === 0) return <span className="text-xs text-muted">incolor</span>
  return (
    <span className="inline-flex gap-1">
      {colors.map((c) => (
        <span key={c} className="w-3.5 h-3.5 rounded-full border border-border" style={{ background: PIP[c] }} />
      ))}
    </span>
  )
}

function ManaCurve({ curve }: { curve: Record<string, number> }) {
  const max = Math.max(1, ...CURVE_KEYS.map((k) => curve[k] ?? 0))
  return (
    <div className="flex items-end gap-1 h-24">
      {CURVE_KEYS.map((k) => {
        const v = curve[k] ?? 0
        return (
          <div key={k} className="flex-1 flex flex-col items-center justify-end h-full">
            <span className="text-[10px] text-muted">{v}</span>
            <div
              className="w-full bg-primary rounded-t"
              style={{ height: `${(v / max) * 100}%`, minHeight: v > 0 ? '3px' : '0' }}
            />
            <span className="text-[10px] text-muted mt-1">{k}</span>
          </div>
        )
      })}
    </div>
  )
}

function Stat({ label, h }: { label: string; h: Health }) {
  const color =
    h.status === 'ok' ? 'text-green-400' : h.status === 'baixo' ? 'text-amber-400' : 'text-sky-400'
  return (
    <div className="bg-surface-2 rounded p-2">
      <div className="text-[11px] text-muted">{label}</div>
      <div className={`text-lg font-semibold ${color}`}>{h.value}</div>
      <div className="text-[10px] text-muted">
        alvo {h.alvo} · {h.status}
      </div>
    </div>
  )
}

function ComboItem({ c }: { c: DeckCombo }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="bg-surface-2 rounded">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left p-1.5 text-xs flex items-start gap-1.5 hover:bg-border/40"
      >
        <span className="text-muted">{open ? '▾' : '▸'}</span>
        <span className="min-w-0">{c.card_names.join(' + ')}</span>
      </button>
      {open && (
        <div className="px-2.5 pb-2.5 pt-1.5 text-xs space-y-1.5 border-t border-border">
          {c.prerequisites && (
            <div>
              <span className="text-accent">Precisa:</span> {c.prerequisites}
            </div>
          )}
          {c.steps && (
            <div>
              <span className="text-accent">Como fazer:</span>{' '}
              <span className="whitespace-pre-wrap">{c.steps}</span>
            </div>
          )}
          <div>
            <span className="text-accent">Resultado:</span> {c.results.join(', ')}
          </div>
          <a
            href={`https://commanderspellbook.com/combo/${c.id}/`}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline inline-block"
          >
            Commander Spellbook ↗
          </a>
        </div>
      )}
    </li>
  )
}

export default function DeckAnalysis({ analysis: a }: { analysis: DeckAnalysisData }) {
  const comp = a.completeness
  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold">Análise</h3>
        <span className="text-accent text-lg font-semibold">${a.price_usd.toFixed(2)}</span>
      </div>

      {/* identidade + completude */}
      <div className="space-y-1 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-muted">Identidade:</span>
          <Pips colors={a.identity} />
        </div>
        <div className={comp.complete && comp.has_commander && comp.off_color.length === 0 ? 'text-green-400' : 'text-amber-400'}>
          {comp.total}/100 cartas · {comp.has_commander ? 'tem comandante' : 'SEM comandante'}
          {comp.complete && comp.has_commander && comp.off_color.length === 0 ? ' · legal ✓' : ''}
        </div>
        {comp.off_color.length > 0 && (
          <div className="text-red-400">Fora da cor: {comp.off_color.join(', ')}</div>
        )}
      </div>

      {/* bracket */}
      <div className="bg-surface-2 rounded p-2">
        <div className="text-[11px] text-muted">Bracket estimado</div>
        <div className={`text-base font-semibold ${BRACKET_COLOR[a.bracket.level] ?? 'text-text'}`}>
          {a.bracket.level} · {a.bracket.name}
        </div>
        <div className="text-[10px] text-muted">{a.bracket.reason}</div>
        {a.bracket.note && (
          <div className="text-[10px] text-amber-400/90 mt-1">⚠ {a.bracket.note}</div>
        )}
        {a.game_changers.length > 0 && (
          <div className="text-[10px] text-muted mt-1">Game changers: {a.game_changers.join(', ')}</div>
        )}
      </div>

      <div className="text-xs text-muted">
        {a.total_cards} cartas · CMC médio {a.avg_cmc}
        {a.predominant_type ? ` · predominante: ${a.predominant_type}` : ''}
      </div>

      <div>
        <div className="text-xs text-muted mb-1">Curva de mana</div>
        <ManaCurve curve={a.curve} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Terrenos" h={a.health.lands} />
        <Stat label="Ramp" h={a.health.ramp} />
        <Stat label="Compra" h={a.health.draw} />
        <Stat label="Interação" h={a.health.interaction} />
      </div>

      <div>
        <div className="text-xs text-muted mb-1">Tipos</div>
        <div className="flex flex-wrap gap-1 text-xs">
          {Object.entries(a.types).map(([t, n]) => (
            <span key={t} className="bg-surface-2 rounded px-2 py-0.5">
              {t}: {n}
            </span>
          ))}
        </div>
      </div>

      {a.combos_present.length > 0 && (
        <div>
          <div className="text-xs text-muted mb-1">
            Combos presentes ({a.combos_present.length}) — clique pra ver como fazer
          </div>
          <ul className="space-y-1">
            {a.combos_present.map((c) => (
              <ComboItem key={c.id} c={c} />
            ))}
          </ul>
        </div>
      )}

      {a.missing_price.length > 0 && (
        <div className="text-[10px] text-muted">{a.missing_price.length} carta(s) sem preço de mercado.</div>
      )}

      <p className="text-[10px] text-muted border-t border-border pt-2">
        Bracket e limiares de saúde são estimativas (heurística), não veredito oficial.
      </p>
    </div>
  )
}
