import type { DeckAnalysisData, Health } from '../api'

const CURVE_KEYS = ['0', '1', '2', '3', '4', '5', '6', '7+']
const PIP: Record<string, string> = {
  W: '#f4f1d8',
  U: '#1f6dab',
  B: '#2b2230',
  R: '#d3202a',
  G: '#1a7b48',
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

export default function DeckAnalysis({ analysis: a }: { analysis: DeckAnalysisData }) {
  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold">Análise</h3>
        <span className="text-accent text-lg font-semibold">${a.price_usd.toFixed(2)}</span>
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

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted">Cores:</span>
        {Object.entries(a.colors)
          .filter(([, n]) => n > 0)
          .map(([c, n]) => (
            <span key={c} className="flex items-center gap-1 text-xs">
              <span
                className="w-3 h-3 rounded-full border border-border"
                style={{ background: PIP[c] }}
              />
              {n}
            </span>
          ))}
      </div>

      {a.combos_present.length > 0 && (
        <div>
          <div className="text-xs text-muted mb-1">Combos presentes ({a.combos_present.length})</div>
          <ul className="space-y-1 text-xs">
            {a.combos_present.slice(0, 8).map((c) => (
              <li key={c.id} className="bg-surface-2 rounded p-1.5">
                <span className="text-text">{c.card_names.join(' + ')}</span>
                <span className="text-muted"> → {c.results.slice(0, 3).join(', ')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {a.missing_price.length > 0 && (
        <div className="text-[10px] text-muted">{a.missing_price.length} carta(s) sem preço listado.</div>
      )}

      <p className="text-[10px] text-muted border-t border-border pt-2">
        Limiares de saúde são guias de Commander (heurística), não regra absoluta.
      </p>
    </div>
  )
}
