'use client'

import { Bell, LogOut, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'

type HeaderProps = {
  userName?: string
  title?: string
  subtitle?: string
}

export default function Header({
  userName,
  title = userName ?? 'Deteccion automatizada de vida silvestre',
  subtitle = userName
    ? 'Panel personal de monitoreo WildlifeAI'
    : 'Plataforma basada en IA para analizar imagenes de camaras trampa'
}: HeaderProps) {
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/login')
    router.refresh()
  }

  return (
    <header className="appHeader">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
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
