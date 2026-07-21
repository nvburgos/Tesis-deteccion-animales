import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Header from '@/components/Header'
import ReportsPanel from '@/components/ReportsPanel'
import Sidebar from '@/components/Sidebar'
import { AUTH_COOKIE, isValidSession } from '@/lib/auth'
import { uiText } from '@/lib/i18n'

export default async function ReportsPage() {
  const session = (await cookies()).get(AUTH_COOKIE)?.value

  if (!isValidSession(session)) {
    redirect('/login')
  }

  return (
    <main className="dashboardShell">
      <Sidebar />
      <section className="dashboardMain">
        <Header title="Centro de Reportes" subtitle="Genera analisis personalizados por camaras, periodos, grupos taxonomicos y especies." />
        <div className="contentArea">
          <ReportsPanel seedDetections={[]} language="es" text={uiText.es} />
        </div>
      </section>
    </main>
  )
}
