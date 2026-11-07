import type { ReactNode } from 'react'

// Estados de tela compartilhados: carregando, erro (com "tentar de novo") e vazio.

export function Loading({ label = 'Carregando…' }: { label?: string }) {
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-muted">
      <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted border-t-transparent" />
      {label}
    </p>
  )
}

export function ErrorState({ error, onRetry, title = 'Algo deu errado' }: { error: unknown; onRetry?: () => void; title?: string }) {
  const msg = error instanceof Error ? error.message : String(error)
  return (
    <div role="alert" className="rounded-lg border border-red-500/40 bg-red-950/30 p-4 text-sm">
      <p className="font-medium text-red-300">{title}</p>
      <p className="mt-1 text-red-200/90">{msg}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-3 rounded-md border border-red-400/50 px-3 py-1.5 text-red-200 hover:bg-red-900/40">
          Tentar de novo
        </button>
      )}
    </div>
  )
}

export function EmptyState({ icon, title, hint, children }: { icon: string; title: string; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-border-strong px-6 py-10 text-center">
      <span aria-hidden className="text-3xl opacity-80">{icon}</span>
      <p className="mt-2 font-display text-lg">{title}</p>
      {hint && <p className="mt-1 max-w-md text-sm text-muted">{hint}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}
