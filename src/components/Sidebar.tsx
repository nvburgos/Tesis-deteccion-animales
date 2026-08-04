'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ClipboardCheck, DatabaseZap, FileText, Grid2X2, PawPrint, Sprout, Users } from 'lucide-react'
import { uiText, type UiText } from '@/lib/i18n'
import type { DashboardView } from './dashboardTypes'

const navItems: { labelKey: keyof UiText; icon: typeof Grid2X2; view: DashboardView }[] = [
  { labelKey: 'dashboard', icon: Grid2X2, view: 'dashboard' },
  { labelKey: 'species', icon: PawPrint, view: 'species' },
  { labelKey: 'reviews', icon: ClipboardCheck, view: 'reviews' }
]

const primaryRouteItems = [{ href: '/cameras', label: 'Panel de Control', icon: Grid2X2 }]
const secondaryRouteItems = [
  { href: '/reports', label: 'Reportes', icon: FileText },
  { href: '/dataset', label: 'Dataset', icon: DatabaseZap },
  { href: '/historial', label: 'Historial', icon: FileText },
  { href: '/statistics', label: 'Estadisticas', icon: PawPrint }
]
const adminRouteItem = { href: '/usuarios', label: 'Usuarios', icon: Users }

type SidebarProps = {
  activeView?: DashboardView
  onViewChange?: (view: DashboardView) => void
  text?: UiText
}

function RouteLink({ href, icon: Icon, label }: { href: string; icon: typeof Grid2X2; label: string }) {
  const pathname = usePathname()
  const isActive = href === '/cameras' ? pathname === href || pathname.startsWith('/cameras/') : pathname === href

  return (
    <Link className={isActive ? 'navItem active' : 'navItem'} href={href}>
      <Icon size={22} />
      <span>{label}</span>
    </Link>
  )
}

export default function Sidebar({ activeView, onViewChange, text = uiText.es }: SidebarProps) {
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    fetch('/api/detections?limit=1', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { currentUser?: { role?: string } } | null) => setIsAdmin(data?.currentUser?.role === 'Admin'))
      .catch(() => setIsAdmin(false))
  }, [])

  const visibleSecondaryRouteItems = isAdmin ? [...secondaryRouteItems, adminRouteItem] : secondaryRouteItems

  return (
    <aside className="sidebar" aria-label="Navegacion principal">
      <div className="sidebarBrand">
        <Sprout size={28} />
        <strong>WildlifeAI</strong>
      </div>

      <nav className="sidebarNav">
        {onViewChange ? (
          navItems.map((item) => {
            const Icon = item.icon
            const isActive = item.view === activeView
            const label = text[item.labelKey]

            return (
              <button aria-current={isActive ? 'page' : undefined} className={isActive ? 'navItem active' : 'navItem'} key={item.view} onClick={() => onViewChange(item.view)} type="button">
                <Icon size={22} />
                <span>{label}</span>
              </button>
            )
          })
        ) : (
          primaryRouteItems.map((item) => <RouteLink href={item.href} icon={item.icon} key={item.href} label={item.label} />)
        )}

        <div className="navDivider" />

        {visibleSecondaryRouteItems.map((item) => <RouteLink href={item.href} icon={item.icon} key={item.href} label={item.label} />)}
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
