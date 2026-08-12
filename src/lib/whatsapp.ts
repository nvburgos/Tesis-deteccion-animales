type TemplateParameter = {
  text: string
  type: 'text'
}

type SendTemplateOptions = {
  bodyParameters?: string[]
  buttonOtpCode?: string
  languageCode?: string
  templateName: string
  to: string
}

export function normalizePhoneNumber(value: string) {
  const digits = value.replace(/[^\d]/g, '')

  if (digits.length < 8 || digits.length > 15) {
    return null
  }

  return `+${digits}`
}

function getWhatsAppConfig() {
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID

  if (!accessToken || !phoneNumberId) {
    return null
  }

  return {
    accessToken,
    apiVersion: process.env.META_WHATSAPP_API_VERSION || 'v23.0',
    phoneNumberId
  }
}

function toWhatsAppRecipient(phoneNumber: string) {
  return phoneNumber.replace(/[^\d]/g, '')
}

export async function sendWhatsAppTemplate(options: SendTemplateOptions) {
  const config = getWhatsAppConfig()

  if (!config) {
    throw new Error('Meta WhatsApp no esta configurado')
  }

  const bodyParameters: TemplateParameter[] = (options.bodyParameters ?? []).map((text) => ({
    text,
    type: 'text'
  }))
  const components: Array<Record<string, unknown>> = []

  if (bodyParameters.length > 0) {
    components.push({ parameters: bodyParameters, type: 'body' })
  }

  if (options.buttonOtpCode) {
    components.push({
      index: '0',
      parameters: [{ text: options.buttonOtpCode, type: 'text' }],
      sub_type: process.env.META_WHATSAPP_OTP_BUTTON_SUBTYPE || 'copy_code',
      type: 'button'
    })
  }

  const response = await fetch(`https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`, {
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toWhatsAppRecipient(options.to),
      type: 'template',
      template: {
        name: options.templateName,
        language: { code: options.languageCode || process.env.META_WHATSAPP_TEMPLATE_LANGUAGE || 'es' },
        ...(components.length > 0 ? { components } : {})
      }
    }),
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json'
    },
    method: 'POST'
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const message = typeof data?.error?.message === 'string' ? data.error.message : 'Meta WhatsApp rechazo el mensaje'
    throw new Error(message)
  }

  return data
}

export async function sendRegistrationOtp(phoneNumber: string, code: string) {
  const templateName = process.env.META_WHATSAPP_OTP_TEMPLATE_NAME || 'wildlifeai_otp'

  return sendWhatsAppTemplate({
    bodyParameters: [code],
    buttonOtpCode: code,
    templateName,
    to: phoneNumber
  })
}
