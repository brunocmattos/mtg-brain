import { useState, useRef, useEffect, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import { api } from '../api'

interface Msg {
  role: 'user' | 'assistant'
  content: string
}

const SUGGESTIONS = [
  'Que combos existem com Gravecrawler?',
  'Como o Vito, Thorn of the Dusk Rose ganha o jogo?',
  'Cartas de dreno pretas até US$5 legais em Commander',
  'Qual a regra de dano de comandante?',
]

export default function ChatPage() {
  const [input, setInput] = useState('')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const endRef = useRef<HTMLDivElement>(null)

  const chat = useMutation({
    mutationFn: (q: string) => api.chat(q),
    onSuccess: (res) => setMsgs((m) => [...m, { role: 'assistant', content: res.answer }]),
    onError: () =>
      setMsgs((m) => [
        ...m,
        { role: 'assistant', content: '⚠️ Erro ao falar com o cérebro. O Ollama e o backend estão rodando?' },
      ]),
  })

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, chat.isPending])

  function ask(q: string) {
    if (!q || chat.isPending) return
    setMsgs((m) => [...m, { role: 'user', content: q }])
    setInput('')
    chat.mutate(q)
  }
  function send(e: FormEvent) {
    e.preventDefault()
    ask(input.trim())
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-7rem)]">
      <div className="flex-1 overflow-y-auto">
        {msgs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-5 px-4">
            <div className="text-accent text-3xl font-display">Pergunte ao cérebro</div>
            <p className="text-muted text-sm max-w-md">
              Pergunte em português. O cérebro consulta o banco local (38k cartas, 91k combos, regras
              oficiais) e responde citando cartas e regras.
            </p>
            <div className="flex flex-col gap-2 w-full max-w-md">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="text-left text-sm bg-surface border border-border rounded-lg px-3 py-2 hover:border-primary transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            {msgs.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
                <div
                  className={`inline-block max-w-[90%] text-left rounded-lg px-3 py-2 text-sm ${
                    m.role === 'user' ? 'bg-primary text-white' : 'bg-surface border border-border'
                  }`}
                >
                  {m.role === 'assistant' ? (
                    <div className="md">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            ))}
            {chat.isPending && (
              <div className="text-muted text-sm">O cérebro está pensando… (modelo local, alguns segundos)</div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <form onSubmit={send} className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={chat.isPending}
          placeholder="Pergunte sobre Magic…"
          className="flex-1 bg-surface border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
        />
        <button
          disabled={chat.isPending}
          className="bg-primary text-white rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </div>
  )
}
