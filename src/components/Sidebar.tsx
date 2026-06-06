'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FileText, Grid2X2, Headphones, Map, PawPrint, Sprout } from 'lucide-react'
import type { DashboardView } from './dashboardTypes'

const navItems: { label: string; icon: typeof Grid2X2; view: DashboardView }[] = [
  { label: 'Panel de Control', icon: Grid2X2, view: 'dashboard' },
  { label: 'Mapa de Campo', icon: Map, view: 'map' },
  { label: 'Especies', icon: PawPrint, view: 'species' },
  { label: 'Reportes', icon: FileText, view: 'reports' },
  
]

const routeItems = [
  { href: '/', label: 'Panel de Control', icon: Grid2X2 },
  { href: '/historial', label: 'Historial', icon: FileText },
  { href: '/estadisticas', label: 'Estadisticas', icon: PawPrint }
]

type SidebarProps = {
  activeView?: DashboardView
  onViewChange?: (view: DashboardView) => void
}

export default function Sidebar({ activeView, onViewChange }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="sidebar" aria-label="Navegacion principal">
      <div className="sidebarBrand">
        <Sprout size={28} />
        <strong>WildlifeAI</strong>
      </div>

      <nav className="sidebarNav">
        {onViewChange
          ? navItems.map((item) => {
              const Icon = item.icon
              const isActive = item.view === activeView

              return (
                <button
                  aria-current={isActive ? 'page' : undefined}
                  className={isActive ? 'navItem active' : 'navItem'}
                  key={item.label}
                  onClick={() => onViewChange(item.view)}
                  type="button"
                >
                  <Icon size={22} />
                  <span>{item.label}</span>
                </button>
              )
            })
          : routeItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href

              return (
                <Link className={isActive ? 'navItem active' : 'navItem'} href={item.href} key={item.href}>
                  <Icon size={22} />
                  <span>{item.label}</span>
                </Link>
              )
            })}
      </nav>

      <div className="researcherCard">
        <span className="researcherAvatar" aria-hidden="true" />
        <div>
          <strong>Investigador WildlifeAI</strong>
          <span>Monitoreo con IA</span>
        </div>
      </div>
    </aside>
  )
}
