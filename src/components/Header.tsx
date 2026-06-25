'use client'

import { AlertTriangle, Bell, CheckCircle2, Clock3, LogOut, Search, XCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { uiText, type UiText } from '@/lib/i18n'
import type { Language } from './dashboardTypes'

export type HeaderNotification = {
  id: string
  title: string
  description: string
  time?: string
  tone: 'alert' | 'review' | 'success' | 'error' | 'info'
}

type HeaderProps = {
  language?: Language
  notifications?: HeaderNotification[]
  onLanguageChange?: (language: Language) => void
  text?: UiText
  title?: string
  subtitle?: string
  userName?: string
}

export default function Header({
  language = 'es',
  notifications = [],
  onLanguageChange,
  text = uiText[language],
  title,
  subtitle,
  userName
}: HeaderProps) {
  const router = useRouter()
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const heading = title ?? userName ?? 'Deteccion automatizada de vida silvestre'
  const description =
    subtitle ??
    (userName ? text.workspaceSubtitle : 'Plataforma basada en IA para analizar imagenes de camaras trampa')
  const unreadCount = notifications.length
  const notificationSummary = useMemo(
    () => (unreadCount > 0 ? `${unreadCount} notificaciones` : 'Sin notificaciones pendientes'),
    [unreadCount]
  )

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
        <div className="notificationMenu">
          <button
            aria-expanded={isNotificationsOpen}
            aria-label="Notificaciones"
            className={unreadCount > 0 ? 'iconButton notificationButton hasNotifications' : 'iconButton notificationButton'}
            onClick={() => setIsNotificationsOpen((currentValue) => !currentValue)}
            type="button"
          >
            <Bell size={22} />
            {unreadCount > 0 ? <span>{Math.min(unreadCount, 9)}</span> : null}
          </button>

          {isNotificationsOpen ? (
            <section className="notificationPanel" aria-label="Centro de notificaciones">
              <div className="notificationHeader">
                <div>
                  <strong>Notificaciones</strong>
                  <span>{notificationSummary}</span>
                </div>
                <button className="secondaryButton" onClick={() => setIsNotificationsOpen(false)} type="button">
                  Cerrar
                </button>
              </div>

              <div className="notificationList">
                {notifications.length > 0 ? (
                  notifications.map((notification) => {
                    const Icon =
                      notification.tone === 'alert'
                        ? AlertTriangle
                        : notification.tone === 'review'
                          ? Clock3
                          : notification.tone === 'success'
                            ? CheckCircle2
                            : notification.tone === 'error'
                              ? XCircle
                              : Bell

                    return (
                      <article className={`notificationItem ${notification.tone}`} key={notification.id}>
                        <span className="notificationIcon">
                          <Icon size={18} />
                        </span>
                        <div>
                          <strong>{notification.title}</strong>
                          <p>{notification.description}</p>
                          {notification.time ? <time>{notification.time}</time> : null}
                        </div>
                      </article>
                    )
                  })
                ) : (
                  <div className="notificationEmpty">
                    <Bell size={24} />
                    <strong>Sin notificaciones</strong>
                    <p>No hay alertas recientes del sistema.</p>
                  </div>
                )}
              </div>
            </section>
          ) : null}
        </div>
        <button className="iconButton" aria-label="Cerrar sesion" onClick={handleLogout} type="button">
          <LogOut size={22} />
        </button>
      </div>
    </header>
  )
}
