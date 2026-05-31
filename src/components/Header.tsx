'use client'

import { Bell, Search } from 'lucide-react'

type HeaderProps = {
  title?: string
  subtitle?: string
}

export default function Header({
  title = 'Deteccion automatizada de vida silvestre',
  subtitle = 'Plataforma basada en IA para analizar imagenes de camaras trampa'
}: HeaderProps) {
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
      </div>
    </header>
  )
}
