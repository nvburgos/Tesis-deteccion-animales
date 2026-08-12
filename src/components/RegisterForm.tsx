'use client'

import { FormEvent, useState } from 'react'
import { Building2, ChevronDown, Eye, EyeOff, Loader2, LockKeyhole, Mail, MessageCircle, ShieldCheck, Sprout, UserRound } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type RegisterResponse = {
  delivery?: 'console' | 'email'
  devOtp?: string
  error?: string
  ok?: boolean
  otpRequired?: boolean
}

const phoneCountries = [
  { code: 'EC', dialCode: '+593', flagClass: 'flagEC', label: 'Ecuador' },
  { code: 'CO', dialCode: '+57', flagClass: 'flagCO', label: 'Colombia' },
  { code: 'PE', dialCode: '+51', flagClass: 'flagPE', label: 'Peru' },
  { code: 'BR', dialCode: '+55', flagClass: 'flagBR', label: 'Brasil' },
  { code: 'CL', dialCode: '+56', flagClass: 'flagCL', label: 'Chile' },
  { code: 'AR', dialCode: '+54', flagClass: 'flagAR', label: 'Argentina' },
  { code: 'MX', dialCode: '+52', flagClass: 'flagMX', label: 'Mexico' },
  { code: 'US', dialCode: '+1', flagClass: 'flagUS', label: 'Estados Unidos' },
  { code: 'ES', dialCode: '+34', flagClass: 'flagES', label: 'Espana' }
]

async function readRegisterResponse(response: Response): Promise<RegisterResponse> {
  const text = await response.text()

  if (!text) {
    return {}
  }

  try {
    return JSON.parse(text) as RegisterResponse
  } catch {
    return { error: text.slice(0, 180) }
  }
}

export default function RegisterForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [institution, setInstitution] = useState('')
  const [phoneCountryCode, setPhoneCountryCode] = useState('EC')
  const [localPhoneNumber, setLocalPhoneNumber] = useState('')
  const [password, setPassword] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [isOtpStep, setIsOtpStep] = useState(false)
  const [isCountryMenuOpen, setIsCountryMenuOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const selectedPhoneCountry = phoneCountries.find((country) => country.code === phoneCountryCode) ?? phoneCountries[0]

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setNotice('')
    setIsSubmitting(true)
    const localDigits = localPhoneNumber.replace(/\D/g, '')
    const phoneNumber = localDigits ? `${selectedPhoneCountry.dialCode}${localDigits}` : undefined

    try {
      const response = await fetch('/api/auth/register', {
        body: JSON.stringify({ email, institution, name, otpCode: isOtpStep ? otpCode : undefined, password, phoneNumber }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      })
      const data = await readRegisterResponse(response)

      if (!response.ok) {
        throw new Error(data.error || 'No se pudo completar el registro. Revisa que el servidor este activo y vuelve a intentar.')
      }

      if (data.otpRequired) {
        setIsOtpStep(true)
        setNotice(data.delivery === 'console' && data.devOtp ? `Modo local: tu codigo es ${data.devOtp}.` : 'Te enviamos un codigo a tu correo.')
        return
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
          {notice ? <div className="loginNotice">{notice}</div> : null}

          <label className="fieldGroup">
            <span>Nombre completo</span>
            <span className="inputShell">
              <UserRound size={19} />
              <input
                autoComplete="name"
                disabled={isOtpStep}
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
                disabled={isOtpStep}
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
                disabled={isOtpStep}
                name="institution"
                onChange={(event) => setInstitution(event.target.value)}
                placeholder="Reserva, universidad o proyecto"
                type="text"
                value={institution}
              />
            </span>
          </label>

          <label className="fieldGroup">
            <span>WhatsApp opcional</span>
            <span className="inputShell phoneInputShell">
              <MessageCircle size={19} />
              <span className="phoneCountryPicker">
                <button
                  aria-expanded={isCountryMenuOpen}
                  aria-haspopup="listbox"
                  className="phoneCountryButton"
                  disabled={isOtpStep}
                  onClick={() => setIsCountryMenuOpen((current) => !current)}
                  type="button"
                >
                  <span className={`countryFlag ${selectedPhoneCountry.flagClass}`} aria-hidden="true" />
                  <span>{selectedPhoneCountry.dialCode}</span>
                  <ChevronDown size={14} />
                </button>
                {isCountryMenuOpen && !isOtpStep ? (
                  <span className="phoneCountryMenu" role="listbox">
                    {phoneCountries.map((country) => (
                      <button
                        aria-selected={country.code === phoneCountryCode}
                        className="phoneCountryOption"
                        key={country.code}
                        onClick={() => {
                          setPhoneCountryCode(country.code)
                          setIsCountryMenuOpen(false)
                        }}
                        role="option"
                        type="button"
                      >
                        <span className={`countryFlag ${country.flagClass}`} aria-hidden="true" />
                        <span>{country.label}</span>
                        <strong>{country.dialCode}</strong>
                      </button>
                    ))}
                  </span>
                ) : null}
              </span>
              <input
                autoComplete="tel"
                disabled={isOtpStep}
                inputMode="tel"
                name="phoneNumber"
                onChange={(event) => setLocalPhoneNumber(event.target.value.replace(/[^\d\s-]/g, ''))}
                placeholder="987 654 321"
                type="tel"
                value={localPhoneNumber}
              />
            </span>
          </label>

          <label className="fieldGroup">
            <span>Contrasena</span>
            <span className="inputShell">
              <LockKeyhole size={19} />
              <input
                autoComplete="new-password"
                disabled={isOtpStep}
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

          {isOtpStep ? (
            <label className="fieldGroup">
              <span>Codigo de correo</span>
              <span className="inputShell">
                <ShieldCheck size={19} />
                <input
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                  name="otpCode"
                  onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  required
                  type="text"
                  value={otpCode}
                />
              </span>
            </label>
          ) : null}

          <button className="primaryButton loginButton" disabled={isSubmitting} type="submit">
            {isSubmitting ? <Loader2 className="spinIcon" size={19} /> : null}
            {isSubmitting ? (isOtpStep ? 'Verificando...' : 'Enviando...') : isOtpStep ? 'Verificar y crear cuenta' : 'Enviar codigo por correo'}
          </button>

          <p className="authSwitch">
            Ya tienes usuario? <Link href="/login">Ingresar</Link>
          </p>
        </form>
      </section>
    </main>
  )
}
