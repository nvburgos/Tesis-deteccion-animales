const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

function loadModule(relativePath) {
  const filename = path.join(process.cwd(), relativePath)
  let source = fs.readFileSync(filename, 'utf8')
  source = source.replace(/export type[\s\S]*?\}\r?\n\r?\n/g, '')
  source = source.replace(/export function /g, 'function ')
  source += '\nmodule.exports = { calculateBatchProgress, getBatchStage }\n'
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const module = { exports: {} }
  Function('require', 'module', 'exports', compiled)(require, module, module.exports)
  return module.exports
}

const { calculateBatchProgress, getBatchStage } = loadModule('src/lib/batchProgress.ts')

const createdAt = new Date('2026-07-26T10:00:00.000Z')
const startedAt = new Date('2026-07-26T10:01:00.000Z')
const now = new Date('2026-07-26T10:03:00.000Z')

test('calculates percentage and pending images from completed units', () => {
  const progress = calculateBatchProgress({ status: 'Procesando', totalImages: 10, processedImages: 3, failedImages: 1, createdAt, startedAt, workerId: 'worker-1' }, now)
  assert.equal(progress.completedImages, 4)
  assert.equal(progress.pendingImages, 6)
  assert.equal(progress.percentage, 40)
})

test('calculates speed and estimated remaining time from startedAt', () => {
  const progress = calculateBatchProgress({ status: 'Procesando', totalImages: 10, processedImages: 4, failedImages: 0, createdAt, startedAt, workerId: 'worker-1' }, now)
  assert.equal(progress.elapsedSeconds, 120)
  assert.equal(progress.queueSeconds, 60)
  assert.equal(Number(progress.imagesPerMinute?.toFixed(2)), 2)
  assert.equal(progress.averageSecondsPerImage, 30)
  assert.equal(progress.estimatedRemainingSeconds, 180)
})

test('does not estimate speed before enough progress exists', () => {
  const progress = calculateBatchProgress({ status: 'Procesando', totalImages: 10, processedImages: 1, failedImages: 0, createdAt, startedAt, workerId: 'worker-1' }, now)
  assert.equal(progress.imagesPerMinute, null)
  assert.equal(progress.estimatedRemainingSeconds, null)
})

test('handles zero images without division by zero', () => {
  const progress = calculateBatchProgress({ status: 'Pendiente', totalImages: 0, processedImages: 0, failedImages: 0, createdAt })
  assert.equal(progress.percentage, null)
  assert.equal(progress.pendingImages, 0)
  assert.equal(progress.stage, 'En cola')
})

test('reports loading stage before first image completes', () => {
  assert.equal(getBatchStage({ status: 'Procesando', totalImages: 114, processedImages: 0, failedImages: 0, createdAt, startedAt, workerId: 'worker-1' }, 0), 'Cargando modelo de inteligencia artificial')
})