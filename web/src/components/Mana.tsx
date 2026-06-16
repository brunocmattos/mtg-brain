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
          <span key={i} className="text-[10px]">{t}</span>
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
