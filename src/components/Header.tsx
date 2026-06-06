'use client'

import { Bell, LogOut, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { uiText, type UiText } from '@/lib/i18n'
import type { Language } from './dashboardTypes'

type HeaderProps = {
  language?: Language
  onLanguageChange?: (language: Language) => void
  text?: UiText
  title?: string
  subtitle?: string
  userName?: string
}

export default function Header({
  language = 'es',
  onLanguageChange,
  text = uiText[language],
  title,
  subtitle,
  userName
}: HeaderProps) {
  const router = useRouter()
  const heading = title ?? userName ?? 'Deteccion automatizada de vida silvestre'
  const description =
    subtitle ??
    (userName ? text.workspaceSubtitle : 'Plataforma basada en IA para analizar imagenes de camaras trampa')

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/login')
    router.refresh()
  }

  return (
    <header className="appHeader">
      <div>
        <h1>{heading}</h1>
        <p>{description}</p>
      </div>

      <div className="headerActions">
        {onLanguageChange ? (
          <div className="languageToggle" aria-label={text.language}>
            <button
              aria-pressed={language === 'es'}
              className={language === 'es' ? 'languageOption active' : 'languageOption'}
              onClick={() => onLanguageChange('es')}
              type="button"
            >
              ES
            </button>
            <button
              aria-pressed={language === 'en'}
              className={language === 'en' ? 'languageOption active' : 'languageOption'}
              onClick={() => onLanguageChange('en')}
              type="button"
            >
              EN
            </button>
          </div>
        ) : null}
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
