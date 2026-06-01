'use client'

import { Bell, LogOut, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'

type HeaderProps = {
  userName: string
}

export default function Header({ userName }: HeaderProps) {
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/login')
    router.refresh()
  }

  return (
    <header className="appHeader">
      <div>
        <h1>{userName}</h1>
        <p>Panel personal de monitoreo WildlifeAI</p>
      </div>

      <div className="headerActions">
        <button className="iconButton" aria-label="Buscar" type="button">
          <Search size={22} />
        </button>
        <button className="iconButton notificationButton" aria-label="Notificaciones" type="button">
          <Bell size={22} />
        </button>
        <button className="iconButton" aria-label="Cerrar sesion" onClick={handleLogout} type="button">
          <LogOut size={22} />
        </button>
      </div>
    </header>
  )
}
