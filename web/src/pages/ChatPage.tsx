import { useState, useRef, useEffect, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import { api } from '../api'

interface Msg {
  role: 'user' | 'assistant'
  content: string
}

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

  function send(e: FormEvent) {
    e.preventDefault()
    const q = input.trim()
    if (!q || chat.isPending) return
    setMsgs((m) => [...m, { role: 'user', content: q }])
    setInput('')
    chat.mutate(q)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {msgs.length === 0 && (
          <p className="text-muted text-sm">
            Pergunte em português — ex.: <em>"que combos existem com Gravecrawler?"</em> ou{' '}
            <em>"como o Wilhelt ganha o jogo?"</em>. O cérebro consulta o banco local e responde
            citando cartas e regras.
          </p>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
            <div
              className={`inline-block max-w-[85%] text-left rounded-lg px-3 py-2 text-sm ${
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
          <div className="text-muted text-sm">
            O cérebro está pensando… (modelo local, pode levar alguns segundos)
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pergunte sobre Magic…"
          className="flex-1 bg-surface border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-primary"
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
