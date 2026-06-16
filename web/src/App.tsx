import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import ChatPage from './pages/ChatPage'
import CommandersPage from './pages/CommandersPage'

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-surface sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-6">
          <span className="font-bold text-accent text-lg tracking-wide">mtg-brain</span>
          <nav className="flex gap-1">
            <Tab to="/commanders" label="Comandantes" />
            <Tab to="/chat" label="Conversar" />
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<Navigate to="/commanders" replace />} />
          <Route path="/commanders" element={<CommandersPage />} />
          <Route path="/chat" element={<ChatPage />} />
        </Routes>
      </main>
    </div>
  )
}

function Tab({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `px-3 py-1.5 rounded-md text-sm transition ${
          isActive ? 'bg-primary text-white' : 'text-muted hover:text-text hover:bg-surface-2'
        }`
      }
    >
      {label}
    </NavLink>
  )
}
