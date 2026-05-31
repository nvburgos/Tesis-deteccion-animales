'use client'

import { FileText, Grid2X2, Headphones, Map, PawPrint, Sprout } from 'lucide-react'

const navItems = [
  { label: 'Panel de Control', icon: Grid2X2, active: true },
  { label: 'Mapa de Campo', icon: Map },
  { label: 'Especies', icon: PawPrint },
  { label: 'Reportes', icon: FileText },
  { label: 'Soporte', icon: Headphones }
]

export default function Sidebar() {
  return (
    <aside className="sidebar" aria-label="Navegación principal">
      <div className="sidebarBrand">
        <Sprout size={28} />
        <strong>WildlifeAI</strong>
      </div>

      <nav className="sidebarNav">
        {navItems.map((item) => {
          const Icon = item.icon

          return (
            <button className={item.active ? 'navItem active' : 'navItem'} key={item.label} type="button">
              <Icon size={22} />
              <span>{item.label}</span>
            </button>
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
