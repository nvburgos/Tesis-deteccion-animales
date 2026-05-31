'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, Grid2X2, History, Sprout } from 'lucide-react'

const navItems = [
  { href: '/', label: 'Panel de Control', icon: Grid2X2 },
  { href: '/historial', label: 'Historial', icon: History },
  { href: '/estadisticas', label: 'Estadisticas', icon: BarChart3 }
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="sidebar" aria-label="Navegacion principal">
      <Link className="sidebarBrand" href="/">
        <Sprout size={28} />
        <strong>WildlifeAI</strong>
      </Link>

      <nav className="sidebarNav">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = pathname === item.href

          return (
            <Link className={active ? 'navItem active' : 'navItem'} href={item.href} key={item.href}>
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
