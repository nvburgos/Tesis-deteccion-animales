import Dashboard from '@/components/Dashboard'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AUTH_COOKIE, getSessionUserId } from '@/lib/auth'
import { ensureDatabase } from '@/lib/database'
import { prisma } from '@/lib/prisma'

export default async function Home() {
  const session = (await cookies()).get(AUTH_COOKIE)?.value
  const userId = getSessionUserId(session)

  if (!userId) {
    redirect('/login')
  }

  await ensureDatabase()

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true }
  })

  if (!user) {
    redirect('/login')
  }

  return <Dashboard userName={user.name} />
}
