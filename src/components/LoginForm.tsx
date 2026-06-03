'use client'

import { FormEvent, useState } from 'react'
import { Eye, EyeOff, Loader2, LockKeyhole, Mail, Sprout } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type LoginResponse = {
  error?: string
  ok?: boolean
}

export default function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const response = await fetch('/api/auth/login', {
        body: JSON.stringify({ email, password }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      })
      const data = (await response.json()) as LoginResponse

      if (!response.ok) {
        throw new Error(data.error || 'No se pudo iniciar sesion')
      }

      router.replace('/')
      router.refresh()
    } catch (loginError: unknown) {
      setError(loginError instanceof Error ? loginError.message : 'No se pudo iniciar sesion')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="loginShell">
      <section className="loginPanel" aria-label="Inicio de sesion">
        <div className="loginBrand">
          <span className="loginBrandMark" aria-hidden="true">
            <Sprout size={30} />
          </span>
          <div>
            <strong>WildlifeAI</strong>
            <span>Monitoreo de camaras trampa</span>
          </div>
        </div>

        <form className="loginForm" onSubmit={handleSubmit}>
          <div className="loginHeading">
            <h1>Acceso al panel</h1>
            <p>Ingresa tus credenciales para revisar detecciones, reportes e imagenes analizadas.</p>
          </div>

          {error ? <div className="loginError">{error}</div> : null}

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
            <span>Contrasena</span>
            <span className="inputShell">
              <LockKeyhole size={19} />
              <input
                autoComplete="current-password"
                name="password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Tu contrasena"
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
            {isSubmitting ? 'Verificando...' : 'Ingresar'}
          </button>

          <p className="authSwitch">
            No tienes usuario? <Link href="/register">Crear cuenta</Link>
          </p>
        </form>
      </section>
    </main>
  )
}
