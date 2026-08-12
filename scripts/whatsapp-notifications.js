async function sendWhatsAppTemplate({ bodyParameters = [], languageCode, templateName, to }) {
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID
  const apiVersion = process.env.META_WHATSAPP_API_VERSION || 'v23.0'

  if (!accessToken || !phoneNumberId || !templateName || !to) {
    return { skipped: true, reason: 'Meta WhatsApp no configurado o usuario sin telefono' }
  }

  const components = bodyParameters.length > 0
    ? [{
      parameters: bodyParameters.map((text) => ({ text: String(text), type: 'text' })),
      type: 'body'
    }]
    : []

  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: String(to).replace(/[^\d]/g, ''),
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode || process.env.META_WHATSAPP_TEMPLATE_LANGUAGE || 'es' },
        ...(components.length > 0 ? { components } : {})
      }
    }),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    method: 'POST'
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const message = data?.error?.message || 'Meta WhatsApp rechazo el mensaje'
    throw new Error(message)
  }

  return data
}

async function notifyBatchFinished(job, status) {
  const templateName = process.env.META_WHATSAPP_BATCH_TEMPLATE_NAME || 'wildlifeai_batch_finished'
  const phoneNumber = job.user?.phoneNumber

  if (!phoneNumber) {
    return { skipped: true, reason: 'usuario sin telefono' }
  }

  return sendWhatsAppTemplate({
    bodyParameters: [
      job.user?.name || 'Investigador',
      String(job.id),
      status,
      String(job.processedImages ?? 0),
      String(job.failedImages ?? 0),
      job.camera ? `${job.camera.name} | ${job.camera.zone}` : 'Camara no asociada'
    ],
    templateName,
    to: phoneNumber
  })
}

module.exports = { notifyBatchFinished, sendWhatsAppTemplate }
