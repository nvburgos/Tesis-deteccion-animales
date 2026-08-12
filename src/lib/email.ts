type SendEmailOptions = {
  html?: string
  subject: string
  text: string
  to: string
}

function getEmailFrom() {
  return process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL || 'WildlifeAI <onboarding@resend.dev>'
}

export function isEmailProviderConfigured() {
  return Boolean(process.env.RESEND_API_KEY)
}

export async function sendEmail({ html, subject, text, to }: SendEmailOptions) {
  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Proveedor de correo no configurado')
    }

    console.warn(`[email:dev] Para: ${to}`)
    console.warn(`[email:dev] Asunto: ${subject}`)
    console.warn(`[email:dev] ${text}`)
    return { skipped: true }
  }

  const response = await fetch('https://api.resend.com/emails', {
    body: JSON.stringify({
      from: getEmailFrom(),
      html: html || text.replace(/\n/g, '<br />'),
      subject,
      text,
      to
    }),
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    method: 'POST'
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const message = typeof data?.message === 'string' ? data.message : 'No se pudo enviar el correo'
    throw new Error(message)
  }

  return data
}

export async function sendRegistrationEmailOtp(email: string, code: string) {
  return sendEmail({
    html: [
      '<div style="margin:0;background:#f4f7f5;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#17211c;">',
      '<div style="margin:0 auto;max-width:560px;background:#ffffff;border:1px solid #dce6e0;border-radius:14px;overflow:hidden;">',
      '<div style="background:#244b36;padding:22px 26px;color:#ffffff;">',
      '<div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">WildlifeAI</div>',
      '<h1 style="margin:8px 0 0;font-size:24px;line-height:1.2;">Codigo de verificacion</h1>',
      '</div>',
      '<div style="padding:26px;">',
      '<p style="margin:0 0 18px;font-size:16px;line-height:1.5;">Usa este codigo para completar tu registro en WildlifeAI.</p>',
      `<div style="margin:0 0 18px;padding:18px;border-radius:12px;background:#eef7f1;text-align:center;font-size:34px;font-weight:800;letter-spacing:.18em;color:#244b36;">${code}</div>`,
      '<p style="margin:0;color:#52615a;font-size:14px;line-height:1.5;">Este codigo vence en 10 minutos. Si no solicitaste este registro, puedes ignorar este mensaje.</p>',
      '</div>',
      '</div>',
      '</div>'
    ].join(''),
    subject: 'Codigo de verificacion WildlifeAI',
    text: [
      `Tu codigo de verificacion de WildlifeAI es: ${code}`,
      '',
      'Este codigo vence en 10 minutos.',
      'Si no solicitaste este registro, puedes ignorar este mensaje.'
    ].join('\n'),
    to: email
  })
}
