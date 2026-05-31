'use client'

import { Bell, Search } from 'lucide-react'

export default function Header() {
  return (
    <header className="appHeader">
      <div>
        <h1>Detección automatizada de vida silvestre</h1>
        <p>Plataforma basada en IA para analizar imágenes de cámaras trampa</p>
      </div>

      <div className="headerActions">
        <button className="iconButton" aria-label="Buscar" type="button">
          <Search size={22} />
        </button>
        <button className="iconButton notificationButton" aria-label="Notificaciones" type="button">
          <Bell size={22} />
        </button>
      </div>
    </header>
  )
}
