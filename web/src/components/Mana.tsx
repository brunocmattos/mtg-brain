import { useQuery } from '@tanstack/react-query'
import { api } from '../api'

// Mapa de símbolos oficiais do Scryfall ({W} -> svg_uri). Cacheado pra sempre.
function useSymbols() {
  return useQuery({ queryKey: ['symbols'], queryFn: api.symbols, staleTime: Infinity, gcTime: Infinity })
    .data
}

const TOKEN = /\{[^}]+\}/g

// Custo de mana como sequência de SVGs oficiais.
export function ManaCost({ cost, className }: { cost?: string | null; className?: string }) {
  const map = useSymbols()
  if (!cost) return null
  const tokens = cost.match(TOKEN) ?? []
  if (tokens.length === 0) return null
  return (
    <span className={`inline-flex items-center gap-px align-middle ${className ?? ''}`}>
      {tokens.map((t, i) =>
        map?.[t] ? (
          <img key={i} src={map[t]} alt={t} className="inline-block h-3.5 w-3.5" />
        ) : (
          <span key={i} className="text-xs">{t}</span>
        ),
      )}
    </span>
  )
}

// Texto do oráculo com os {símbolos} trocados pelos SVGs oficiais.
export function OracleText({ text, className }: { text?: string | null; className?: string }) {
  const map = useSymbols()
  if (!text) return null
  const parts = text.split(/(\{[^}]+\})/g)
  return (
    <span className={`whitespace-pre-wrap ${className ?? ''}`}>
      {parts.map((p, i) =>
        /^\{[^}]+\}$/.test(p) && map?.[p] ? (
          <img key={i} src={map[p]} alt={p} className="inline-block h-3.5 w-3.5 align-middle mx-px" />
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  )
}

const COLORS = ['W', 'U', 'B', 'R', 'G'] as const
const COLOR_PT: Record<string, string> = { W: 'Branco', U: 'Azul', B: 'Preto', R: 'Vermelho', G: 'Verde', C: 'Incolor' }

// Um símbolo de mana oficial ({W}, {B}…); cai pra letra enquanto o mapa carrega.
export function ManaSymbol({ c, className = 'h-4 w-4' }: { c: string; className?: string }) {
  const map = useSymbols()
  const src = map?.[`{${c}}`]
  return src ? (
    <img src={src} alt={COLOR_PT[c] ?? c} title={COLOR_PT[c] ?? c} className={`inline-block ${className}`} />
  ) : (
    <span title={COLOR_PT[c] ?? c} className="text-xs font-bold">{c}</span>
  )
}

// Identidade de cor como símbolos oficiais (a bolinha preta sumia no fundo escuro).
export function ColorPips({ colors, className }: { colors: string[]; className?: string }) {
  if (colors.length === 0) return <span className="text-xs text-muted">incolor</span>
  return (
    <span className="inline-flex gap-0.5">
      {colors.map((c) => <ManaSymbol key={c} c={c} className={className} />)}
    </span>
  )
}

// Filtro W/U/B/R/G com os símbolos oficiais; botões alternáveis (aria-pressed).
export function ColorFilter({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex gap-1" role="group" aria-label="Filtrar por cor">
      {COLORS.map((c) => {
        const on = value.includes(c)
        return (
          <button
            type="button"
            key={c}
            aria-pressed={on}
            aria-label={COLOR_PT[c]}
            onClick={() => onChange(on ? value.filter((x) => x !== c) : [...value, c])}
            className={`flex h-9 w-9 items-center justify-center rounded-md border transition ${
              on ? 'border-accent bg-surface-2' : 'border-border-strong opacity-60 hover:opacity-90'
            }`}
          >
            <ManaSymbol c={c} className="h-5 w-5" />
          </button>
        )
      })}
    </div>
  )
}
