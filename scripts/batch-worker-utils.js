function parsePositiveInt(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function createWorkerId(value = process.env.WORKER_ID) {
  if (value && String(value).trim()) return String(value).trim()
  const host = process.env.COMPUTERNAME || process.env.HOSTNAME || 'local'
  return `${host}-${process.pid}-${Date.now()}`
}

function getWorkerConfig(env = process.env) {
  return {
    heartbeatSeconds: parsePositiveInt(env.WORKER_HEARTBEAT_SECONDS, 10),
    maxAttempts: parsePositiveInt(env.MAX_BATCH_ATTEMPTS, 3),
    staleMinutes: parsePositiveInt(env.BATCH_STALE_MINUTES, 15),
    workerId: createWorkerId(env.WORKER_ID)
  }
}

function getStaleCutoff(now, staleMinutes) {
  return new Date(now.getTime() - staleMinutes * 60 * 1000)
}

function canRetryBatch(job, maxAttempts) {
  return Number(job.attempts || 0) < maxAttempts
}

function shouldFailStaleBatch(job, maxAttempts) {
  return !canRetryBatch(job, maxAttempts)
}

function getRetryError(job, staleMinutes) {
  return `Lote reencolado: heartbeat vencido por mas de ${staleMinutes} minutos. Intentos previos: ${job.attempts || 0}.`
}

function getFinalFailureError(job, staleMinutes, maxAttempts) {
  return `Lote fallido: heartbeat vencido por mas de ${staleMinutes} minutos y alcanzo ${job.attempts || 0}/${maxAttempts} intentos.`
}

module.exports = {
  canRetryBatch,
  createWorkerId,
  getFinalFailureError,
  getRetryError,
  getStaleCutoff,
  getWorkerConfig,
  parsePositiveInt,
  shouldFailStaleBatch
}