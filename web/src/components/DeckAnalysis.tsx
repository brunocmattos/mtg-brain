import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import type { DeckAnalysisData, DeckCombo, Health } from '../api'

const SEV_COLOR: Record<string, string> = {
  alto: 'text-red-400', medio: 'text-amber-400', baixo: 'text-sky-400', ok: 'text-green-400',
}
const usd = (v: number) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const eur = (v: number) => v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })

// bandeiras em SVG (emoji de bandeira não renderiza no Windows)
const FLAG = 'inline-block h-3.5 w-5 rounded-[2px] border border-black/30 align-middle'
function UsFlag() {
  return (
    <svg viewBox="0 0 30 20" className={FLAG} aria-label="USD">
      <rect width="30" height="20" fill="#b22234" />
      <rect y="2.857" width="30" height="2.857" fill="#fff" />
      <rect y="8.571" width="30" height="2.857" fill="#fff" />
      <rect y="14.285" width="30" height="2.857" fill="#fff" />
      <rect width="12" height="11.43" fill="#3c3b6e" />
    </svg>
  )
}
function BrFlag() {
  return (
    <svg viewBox="0 0 30 20" className={FLAG} aria-label="BRL">
      <rect width="30" height="20" fill="#009b3a" />
      <polygon points="15,2 28,10 15,18 2,10" fill="#fedf00" />
      <circle cx="15" cy="10" r="4.2" fill="#002776" />
    </svg>
  )
}

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
const TYPE_PT: Record<string, string> = {
  commander: 'comandante', creature: 'criaturas', planeswalker: 'planeswalkers',
  instant: 'instants', sorcery: 'sorceries', artifact: 'artefatos',
  enchantment: 'encantamentos', battle: 'battles', land: 'terrenos', outro: 'outros',
}
const typePt = (t: string) => TYPE_PT[t] ?? t

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
  const { data: fx } = useQuery({ queryKey: ['fx-usd-brl'], queryFn: api.fx, staleTime: 6 * 3600 * 1000 })
  const rate = fx?.rate ?? 5.4
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <h3 className="font-semibold">Análise</h3>
        <div className="text-right leading-tight">
          <div className="text-accent text-lg font-semibold flex items-center justify-end gap-1.5"><UsFlag /> {usd(a.price_usd)}</div>
          <div className="text-sm text-muted flex items-center justify-end gap-1.5"><BrFlag /> {brl(a.price_usd * rate)}</div>
        </div>
      </div>
      <div className="-mt-3 text-right text-[10px] text-muted" title="preços por fonte (terrenos básicos não contam)">
        TCGplayer {usd(a.price_usd)} · Cardmarket {eur(a.price_eur)} · MTGO {a.price_tix.toFixed(2)} tix
        {fx?.source === 'fallback' ? ' · câmbio aprox.' : ''}
      </div>

      {a.power && (
        <div className="rounded bg-surface-2 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wide text-muted">Poder &amp; Consistência</span>
            <span className="cursor-help text-xs text-muted" title="Estimativa de quão bem montado/forte o deck está — NÃO é taxa de vitória (não modela oponentes, pilotagem nem sorte).">ⓘ</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold text-accent">{a.power.score}</span>
            <span className="text-sm text-muted">/100</span>
            <span className="text-sm font-semibold">· {a.power.label}</span>
          </div>
          <div className="mt-2 space-y-1.5">
            {a.power.axes.map((ax) => (
              <div key={ax.key} title={ax.detail}>
                <div className="flex justify-between text-[11px]">
                  <span>{ax.label}</span>
                  <span className="text-muted">{ax.score.toFixed(1)}/10</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded bg-bg">
                  <div className="h-full bg-primary" style={{ width: `${Math.min(100, ax.score * 10)}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 text-[10px] text-muted">
            {a.power.verdict} <span className="opacity-70">Estimativa de construção, não taxa de vitória.</span>
          </div>
          {a.power.note && <div className="mt-1 text-[10px] text-amber-400">{a.power.note}</div>}
        </div>
      )}

      {/* identidade + completude */}
      <div className="space-y-1 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-muted">Identidade:</span>
          <Pips colors={a.identity} />
        </div>
        <div className={comp.complete && comp.has_commander && comp.off_color.length === 0 ? 'text-green-400' : 'text-amber-400'}>
          {comp.total} de 100 cartas{comp.total < 100 ? ` (faltam ${100 - comp.total})` : ''} · {comp.has_commander ? 'tem comandante' : 'SEM comandante'}
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
        {a.predominant_type ? ` · predominante: ${typePt(a.predominant_type)}` : ''}
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

      {a.gaps && a.gaps.length > 0 && (
        <div>
          <div className="text-xs text-muted mb-1">O que falta / pontos fracos</div>
          {a.interaction_detail && (
            <div className="mb-1.5 text-[10px] text-muted">
              Interação: {a.interaction_detail.total} total · <span className="text-text">{a.interaction_detail.instant_speed} em velocidade de instante</span> · {a.interaction_detail.wipes} wipes · {a.interaction_detail.counters} counters
            </div>
          )}
          <ul className="space-y-1 text-xs">
            {a.gaps.map((g, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className={`mt-0.5 leading-none ${SEV_COLOR[g.severity] ?? 'text-muted'}`}>●</span>
                <span>{g.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <div className="text-xs text-muted mb-1">Tipos</div>
        <div className="flex flex-wrap gap-1 text-xs">
          {Object.entries(a.types).map(([t, n]) => (
            <span key={t} className="bg-surface-2 rounded px-2 py-0.5">
              {typePt(t)}: {n}
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
