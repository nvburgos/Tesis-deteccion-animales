const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

function loadModule(relativePath) {
  const filename = path.join(process.cwd(), relativePath)
  let source = fs.readFileSync(filename, 'utf8')
  source = source.replace("import { isValidSpecies, normalizeSpeciesName } from './detectionClassification'", "const { isValidSpecies, normalizeSpeciesName } = require('./detectionClassification')")
  source = source.replace(/export const /g, 'const ')
  source = source.replace(/export type[\s\S]*?\r?\n\r?\n/, '')
  source = source.replace(/export function /g, 'function ')
  source += '\nmodule.exports = { manualReviewStatuses, isManualReviewStatus, getManualReviewStatus, isPendingManualReview }\n'
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const module = { exports: {} }
  const localRequire = (specifier) => {
    if (specifier === './detectionClassification') {
      const invalid = new Set(['sin deteccion', 'sin detección', 'no cv result', 'unknown', '', 'imagen no evaluable'])
      const normalizeSpeciesName = (value) => (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_-]/g, ' ').toLowerCase().trim()
      return {
        normalizeSpeciesName,
        isValidSpecies: (value) => !invalid.has(normalizeSpeciesName(value))
      }
    }
    return require(specifier)
  }
  Function('require', 'module', 'exports', compiled)(localRequire, module, module.exports)
  return module.exports
}

const policy = loadModule('src/lib/manualReviewPolicy.ts')

test('classifies matching reviewed species as confirmed', () => {
  assert.equal(policy.getManualReviewStatus({ originalSpecies: 'South American Coati', reviewedSpecies: 'South American Coati' }), 'Confirmada')
})

test('classifies changed valid species as corrected', () => {
  assert.equal(policy.getManualReviewStatus({ originalSpecies: 'Unknown', reviewedSpecies: 'Ocelote' }), 'Corregida')
})

test('classifies no-fauna and non-evaluable outcomes explicitly', () => {
  assert.equal(policy.getManualReviewStatus({ originalSpecies: 'Unknown', reviewedSpecies: 'Sin deteccion' }), 'Sin fauna')
  assert.equal(policy.getManualReviewStatus({ originalSpecies: 'Unknown', reviewedSpecies: 'Imagen no evaluable' }), 'No evaluable')
})

test('honors explicit valid status for discard flow', () => {
  assert.equal(policy.getManualReviewStatus({ originalSpecies: 'Unknown', reviewedSpecies: 'Imagen no evaluable', explicitStatus: 'Descartada' }), 'Descartada')
  assert.equal(policy.isManualReviewStatus('Estado inventado'), false)
})

test('detects pending manual review from stored status or legacy fields', () => {
  assert.equal(policy.isPendingManualReview({ manualReviewStatus: 'Pendiente', manualReviewedAt: new Date(), priority: 'Normal' }), true)
  assert.equal(policy.isPendingManualReview({ priority: 'Revision manual', manualReviewedAt: null }), true)
  assert.equal(policy.isPendingManualReview({ manualReviewStatus: 'Confirmada', priority: 'Revision manual', manualReviewedAt: null }), false)
})