async function sendEmail({ html, subject, text, to }) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL || 'WildlifeAI <onboarding@resend.dev>'

  if (!apiKey || !to) {
    return { skipped: true, reason: 'correo no configurado o destinatario vacio' }
  }

  const response = await fetch('https://api.resend.com/emails', {
    body: JSON.stringify({
      from,
      html: html || String(text).replace(/\n/g, '<br />'),
      subject,
      text,
      to
    }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    method: 'POST'
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(data?.message || 'No se pudo enviar el correo')
  }

  return data
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getStatusTheme(status) {
  if (status === 'Completado') {
    return { background: '#e8f5ee', color: '#246241', label: 'Completado' }
  }

  if (status === 'Con errores') {
    return { background: '#fff4df', color: '#8a5a12', label: 'Con errores' }
  }

  return { background: '#fdecea', color: '#9b2d20', label: status || 'Finalizado' }
}

function getAppUrl() {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
}

function renderMetric(label, value) {
  return [
    '<td style="padding:0 8px 12px 0;width:50%;">',
    '<div style="border:1px solid #dce6e0;border-radius:12px;padding:14px;background:#fbfcfb;">',
    `<div style="color:#65726b;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">${escapeHtml(label)}</div>`,
    `<div style="margin-top:6px;color:#17211c;font-size:22px;font-weight:800;">${escapeHtml(value)}</div>`,
    '</div>',
    '</td>'
  ].join('')
}

function renderBatchFinishedEmail(job, status) {
  const theme = getStatusTheme(status)
  const researcher = job.user?.name || 'Investigador'
  const camera = job.camera ? `${job.camera.name} | ${job.camera.zone}` : 'Camara no asociada'
  const appUrl = getAppUrl()
  const batchUrl = appUrl ? `${appUrl}/historial?batchJobId=${job.id}` : ''

  return [
    '<div style="margin:0;background:#f4f7f5;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#17211c;">',
    '<div style="margin:0 auto;max-width:640px;background:#ffffff;border:1px solid #dce6e0;border-radius:16px;overflow:hidden;">',
    '<div style="background:#244b36;padding:24px 28px;color:#ffffff;">',
    '<div style="font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">WildlifeAI</div>',
    '<h1 style="margin:10px 0 0;font-size:26px;line-height:1.2;">Procesamiento de lote finalizado</h1>',
    '</div>',
    '<div style="padding:28px;">',
    `<p style="margin:0 0 18px;font-size:16px;line-height:1.55;">Hola ${escapeHtml(researcher)}, el lote <strong>#${escapeHtml(job.id)}</strong> ya termino su procesamiento.</p>`,
    `<div style="display:inline-block;margin:0 0 22px;padding:8px 12px;border-radius:999px;background:${theme.background};color:${theme.color};font-size:13px;font-weight:800;">${escapeHtml(theme.label)}</div>`,
    '<table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin:0 0 10px;">',
    '<tr>',
    renderMetric('Procesadas', job.processedImages ?? 0),
    renderMetric('Fallidas', job.failedImages ?? 0),
    '</tr>',
    '<tr>',
    renderMetric('Lote', `#${job.id}`),
    renderMetric('Camara', camera),
    '</tr>',
    '</table>',
    batchUrl ? `<a href="${escapeHtml(batchUrl)}" style="display:inline-block;margin-top:14px;background:#244b36;color:#ffffff;text-decoration:none;border-radius:10px;padding:12px 16px;font-weight:800;">Revisar resultados</a>` : '',
    '<p style="margin:22px 0 0;color:#65726b;font-size:13px;line-height:1.5;">Este mensaje fue enviado automaticamente por WildlifeAI.</p>',
    '</div>',
    '</div>',
    '</div>'
  ].join('')
}

async function notifyBatchFinishedByEmail(job, status) {
  const camera = job.camera ? `${job.camera.name} | ${job.camera.zone}` : 'Camara no asociada'
  const appUrl = getAppUrl()
  const batchUrl = appUrl ? `${appUrl}/historial?batchJobId=${job.id}` : ''

  return sendEmail({
    html: renderBatchFinishedEmail(job, status),
    subject: `WildlifeAI: lote #${job.id} ${status}`,
    text: [
      `Hola ${job.user?.name || 'Investigador'},`,
      '',
      `El lote #${job.id} finalizo con estado: ${status}.`,
      `Imagenes procesadas: ${job.processedImages ?? 0}`,
      `Imagenes fallidas: ${job.failedImages ?? 0}`,
      `Camara: ${camera}`,
      batchUrl ? `Link: ${batchUrl}` : '',
      '',
      'Ya puedes revisar los resultados en WildlifeAI.'
    ].filter(Boolean).join('\n'),
    to: job.user?.email
  })
}

module.exports = { notifyBatchFinishedByEmail, sendEmail }
