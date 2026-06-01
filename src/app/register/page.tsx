import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import RegisterForm from '@/components/RegisterForm'
import { AUTH_COOKIE, isValidSession } from '@/lib/auth'

export default async function RegisterPage() {
  const session = (await cookies()).get(AUTH_COOKIE)?.value

  if (isValidSession(session)) {
    redirect('/')
  }

  return <RegisterForm />
}
