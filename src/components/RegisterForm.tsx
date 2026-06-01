'use client'

import { FormEvent, useState } from 'react'
import { Building2, Eye, EyeOff, Loader2, LockKeyhole, Mail, Sprout, UserRound } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type RegisterResponse = {
  error?: string
  ok?: boolean
}

export default function RegisterForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [institution, setInstitution] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const response = await fetch('/api/auth/register', {
        body: JSON.stringify({ email, institution, name, password }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      })
      const data = (await response.json()) as RegisterResponse

      if (!response.ok) {
        throw new Error(data.error || 'No se pudo crear el usuario')
      }

      router.replace('/')
      router.refresh()
    } catch (registerError: unknown) {
      setError(registerError instanceof Error ? registerError.message : 'No se pudo crear el usuario')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="loginShell">
      <section className="loginPanel registerPanel" aria-label="Crear usuario">
        <div className="loginBrand">
          <span className="loginBrandMark" aria-hidden="true">
            <Sprout size={30} />
          </span>
          <div>
            <strong>WildlifeAI</strong>
            <span>Registro de investigadores y operadores de monitoreo.</span>
          </div>
        </div>

        <form className="loginForm" onSubmit={handleSubmit}>
          <div className="loginHeading">
            <h1>Crear usuario</h1>
            <p>Completa los datos basicos para habilitar el acceso al panel.</p>
          </div>

          {error ? <div className="loginError">{error}</div> : null}

          <label className="fieldGroup">
            <span>Nombre completo</span>
            <span className="inputShell">
              <UserRound size={19} />
              <input
                autoComplete="name"
                name="name"
                onChange={(event) => setName(event.target.value)}
                placeholder="Investigador WildlifeAI"
                required
                type="text"
                value={name}
              />
            </span>
          </label>

          <label className="fieldGroup">
            <span>Correo</span>
            <span className="inputShell">
              <Mail size={19} />
              <input
                autoComplete="email"
                name="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nombre@institucion.org"
                required
                type="email"
                value={email}
              />
            </span>
          </label>

          <label className="fieldGroup">
            <span>Institucion</span>
            <span className="inputShell">
              <Building2 size={19} />
              <input
                autoComplete="organization"
                name="institution"
                onChange={(event) => setInstitution(event.target.value)}
                placeholder="Reserva, universidad o proyecto"
                type="text"
                value={institution}
              />
            </span>
          </label>

          <label className="fieldGroup">
            <span>Contrasena</span>
            <span className="inputShell">
              <LockKeyhole size={19} />
              <input
                autoComplete="new-password"
                minLength={6}
                name="password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Minimo 6 caracteres"
                required
                type={showPassword ? 'text' : 'password'}
                value={password}
              />
              <button
                aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                className="inputIconButton"
                onClick={() => setShowPassword((current) => !current)}
                type="button"
              >
                {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </span>
          </label>

          <button className="primaryButton loginButton" disabled={isSubmitting} type="submit">
            {isSubmitting ? <Loader2 className="spinIcon" size={19} /> : null}
            {isSubmitting ? 'Creando...' : 'Crear cuenta'}
          </button>

          <p className="authSwitch">
            Ya tienes usuario? <Link href="/login">Ingresar</Link>
          </p>
        </form>
      </section>
    </main>
  )
}
