'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FileText, Grid2X2, Headphones, Map, PawPrint, Sprout, Users } from 'lucide-react'
import { uiText, type UiText } from '@/lib/i18n'
import type { DashboardView } from './dashboardTypes'

const navItems: { labelKey: keyof UiText; icon: typeof Grid2X2; view: DashboardView }[] = [
  { labelKey: 'dashboard', icon: Grid2X2, view: 'dashboard' },
  { labelKey: 'fieldMap', icon: Map, view: 'map' },
  { labelKey: 'species', icon: PawPrint, view: 'species' },
  { labelKey: 'reports', icon: FileText, view: 'reports' },
  { labelKey: 'support', icon: Headphones, view: 'support' }
]

const routeItems = [
  { href: '/', label: 'Panel de Control', icon: Grid2X2 },
  { href: '/historial', label: 'Historial', icon: FileText },
  { href: '/estadisticas', label: 'Estadisticas', icon: PawPrint }
]

const adminRouteItem = { href: '/usuarios', label: 'Usuarios', icon: Users }

type SidebarProps = {
  activeView?: DashboardView
  onViewChange?: (view: DashboardView) => void
  text?: UiText
}

export default function Sidebar({ activeView, onViewChange, text = uiText.es }: SidebarProps) {
  const pathname = usePathname()
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    fetch('/api/detections?limit=1', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { currentUser?: { role?: string } } | null) => {
        setIsAdmin(data?.currentUser?.role === 'Admin')
      })
      .catch(() => setIsAdmin(false))
  }, [])

  const visibleRouteItems = isAdmin ? [...routeItems, adminRouteItem] : routeItems
  const secondaryRouteItems = visibleRouteItems.filter((item) => item.href !== '/')

  return (
    <aside className="sidebar" aria-label="Navegacion principal">
      <div className="sidebarBrand">
        <Sprout size={28} />
        <strong>WildlifeAI</strong>
      </div>

      <nav className="sidebarNav">
        {onViewChange ? (
          <>
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = item.view === activeView
              const label = text[item.labelKey]

              return (
                <button
                  aria-current={isActive ? 'page' : undefined}
                  className={isActive ? 'navItem active' : 'navItem'}
                  key={item.view}
                  onClick={() => onViewChange(item.view)}
                  type="button"
                >
                  <Icon size={22} />
                  <span>{label}</span>
                </button>
              )
            })}

            <div className="navDivider" />

            {secondaryRouteItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href

              return (
                <Link className={isActive ? 'navItem active' : 'navItem'} href={item.href} key={item.href}>
                  <Icon size={22} />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </>
        ) : (
          visibleRouteItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href

              return (
                <Link className={isActive ? 'navItem active' : 'navItem'} href={item.href} key={item.href}>
                  <Icon size={22} />
                  <span>{item.label}</span>
                </Link>
              )
            })
        )}
      </nav>

      <div className="researcherCard">
        <span className="researcherAvatar" aria-hidden="true" />
        <div>
          <strong>{text.researcher}</strong>
          <span>{text.wildlifeMonitoring}</span>
        </div>
      </div>
    </aside>
  )
}