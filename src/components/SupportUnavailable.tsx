'use client'

import { PawPrint, Sprout } from 'lucide-react'
import type { UiText } from '@/lib/i18n'

export default function SupportUnavailable({ text }: { text: UiText }) {
  return (
    <section className="supportSplash" aria-label={text.support}>
      <div className="supportSplashIcon" aria-hidden="true">
        <PawPrint size={54} />
        <span>
          <Sprout size={26} />
        </span>
      </div>

      <div className="supportSplashText">
        <span>Soporte temporalmente no disponible</span>
        <h2>Actualmente el soporte no esta disponible.</h2>
        <p>Contacte mas tarde para recibir ayuda con la plataforma WildlifeAI.</p>
      </div>
    </section>
  )
}
