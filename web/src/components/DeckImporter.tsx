import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import Modal from './Modal'

const PLACEHOLDER = `Cole a decklist aqui, uma carta por linha:

1 Wilhelt, the Rotcleaver
1 Gravecrawler
1 Sol Ring
14 Swamp
...

Funciona com o "Export" do Moxfield/Archidekt (com ou sem set/coleção).`

export default function DeckImporter({
  onClose,
  onImported,
}: {
  onClose: () => void
  onImported: (id: number) => void
}) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [cmd, setCmd] = useState('')

  const imp = useMutation({
    mutationFn: () => api.importDeck(name.trim() || 'Deck importado', text, cmd.trim() || null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['decks'] }),
  })
  const res = imp.data


  return (
    <Modal label="Importar deck" onClose={onClose} className="max-w-2xl rounded-xl border border-border bg-bg">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="font-display text-xl">Importar deck</h2>
          <button onClick={onClose} aria-label="Fechar" className="text-sm text-muted hover:text-text">✕</button>
        </div>

        {res ? (
          <div className="space-y-3 overflow-y-auto p-4">
            <p className="text-green-400">
              ✓ {res.added} cartas importadas em <span className="font-medium">{res.deck_name}</span> ({res.total_cards} no total)
              {res.commander ? <> · comandante: <span className="text-accent">{res.commander}</span></> : ''}
            </p>
            {res.over_limit && (
              <div className="rounded-md border border-amber-500/40 bg-surface p-3 text-sm text-amber-400">
                O deck ficou com {res.total_cards} cartas (Commander = 100). Confira a lista.
              </div>
            )}
            {res.missing.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-surface p-3 text-sm">
                <div className="mb-1 text-amber-400">{res.missing.length} carta(s) não encontrada(s) no banco:</div>
                <div className="text-muted text-xs">{res.missing.join(', ')}</div>
                <div className="mt-1 text-muted text-xs">Confira a grafia exata (ou pode ser carta nova ainda não ingerida).</div>
              </div>
            )}
            <button
              onClick={() => onImported(res.deck_id)}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg"
            >
              Abrir deck →
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-2 overflow-y-auto p-4">
              <div className="flex flex-wrap gap-2">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="nome do deck (opcional)" aria-label="Nome do deck"
                  className="min-w-44 flex-1 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm focus:border-primary" />
                <input value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder="comandante (opcional)" aria-label="Comandante"
                  className="min-w-44 flex-1 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm focus:border-primary" />
              </div>
              <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={PLACEHOLDER} rows={12} aria-label="Decklist"
                className="w-full resize-y rounded-md border border-border-strong bg-surface px-3 py-2 font-mono text-xs focus:border-primary" />
              <p className="text-muted text-xs">
                Dica: se o export não marcar o comandante, preencha o campo "comandante" acima.
              </p>
              {imp.isError && <p role="alert" className="text-sm text-red-400">Não consegui importar: {imp.error.message}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border p-4">
              <button onClick={onClose} className="px-3 text-sm text-muted hover:text-text">Cancelar</button>
              <button
                disabled={!text.trim() || imp.isPending}
                onClick={() => imp.mutate()}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {imp.isPending ? 'Importando…' : 'Importar'}
              </button>
            </div>
          </>
        )}
    </Modal>
  )
}
