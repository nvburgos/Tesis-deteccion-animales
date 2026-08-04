import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Header from '@/components/Header'
import Sidebar from '@/components/Sidebar'
import TrainingDatasetPanel from '@/components/TrainingDatasetPanel'
import { AUTH_COOKIE, isValidSession } from '@/lib/auth'

export default async function DatasetPage() {
  const session = (await cookies()).get(AUTH_COOKIE)?.value

  if (!isValidSession(session)) {
    redirect('/login')
  }

  return (
    <main className="dashboardShell">
      <Sidebar />
      <section className="dashboardMain">
        <Header title="Dataset de entrenamiento" subtitle="Controla las muestras curadas que nacen de la revision manual." />
        <div className="contentArea">
          <TrainingDatasetPanel />
        </div>
      </section>
    </main>
  )
}
