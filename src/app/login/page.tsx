import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import LoginForm from '@/components/LoginForm'
import { AUTH_COOKIE, isValidSession } from '@/lib/auth'

export default async function LoginPage() {
  const session = (await cookies()).get(AUTH_COOKIE)?.value

  if (isValidSession(session)) {
    redirect('/')
  }

  return <LoginForm />
}
