import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import CommandersPage from './pages/CommandersPage'
import CardsPage from './pages/CardsPage'
import { DeckList, DeckView } from './pages/DecksPage'

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-surface sticky top-0 z-10">
        <div className="max-w-[96rem] mx-auto px-4 lg:px-8 h-14 flex items-center gap-4 sm:gap-6">
          <span className="shrink-0 whitespace-nowrap font-display font-bold text-accent text-base sm:text-lg tracking-wider">mtg-brain</span>
          <nav className="flex min-w-0 gap-1 overflow-x-auto" aria-label="Principal">
            <Tab to="/commanders" label="Comandantes" />
            <Tab to="/cards" label="Cartas" />
            <Tab to="/decks" label="Decks" />
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-[96rem] w-full mx-auto px-4 lg:px-8 py-6">
        <Routes>
          <Route path="/" element={<Navigate to="/commanders" replace />} />
          <Route path="/commanders" element={<CommandersPage />} />
          <Route path="/cards" element={<CardsPage />} />
          <Route path="/decks" element={<DeckList />} />
          <Route path="/decks/:id" element={<DeckView />} />
          <Route path="*" element={<Navigate to="/commanders" replace />} />
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
