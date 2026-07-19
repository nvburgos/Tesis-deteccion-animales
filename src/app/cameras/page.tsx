import CamerasPanel from '@/components/CamerasPanel'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AUTH_COOKIE, isValidSession } from '@/lib/auth'

export default async function CamerasPage() {
  const session = (await cookies()).get(AUTH_COOKIE)?.value

  if (!isValidSession(session)) {
    redirect('/login')
  }

  return <CamerasPanel />
}
