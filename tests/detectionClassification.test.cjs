const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

function loadModule(relativePath) {
  const filename = path.join(process.cwd(), relativePath)
  let source = fs.readFileSync(filename, 'utf8')
  source = source.replace("import { normalizeTaxonomyKey } from './speciesTaxonomy'", "const { normalizeTaxonomyKey } = require('./speciesTaxonomy')")
  source = source.replace(/export type[\s\S]*?\}\r?\n\r?\n/, '')
  source = source.replace(/export const /g, 'const ')
  source = source.replace(/export function /g, 'function ')
  source += '\nmodule.exports = { invalidSpeciesValues, normalizeSpeciesName, isValidSpecies, isBroadSpeciesLabel, isPositiveFaunaDetection, isPositiveDetection, isWithoutDetectionResult, isWithoutDetection, isValidDistinctSpecies, shouldRequireManualReview, getConfidenceBucket }\n'
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const module = { exports: {} }
  const localRequire = (specifier) => {
    if (specifier === './speciesTaxonomy') {
      return { normalizeTaxonomyKey: (value) => (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_-]/g, ' ').toLowerCase().trim() }
    }
    return require(specifier)
  }
  Function('require', 'module', 'exports', compiled)(localRequire, module, module.exports)
  return module.exports
}

const rules = loadModule('src/lib/detectionClassification.ts')

test('excludes non species labels from valid species', () => {
  for (const species of ['Sin deteccion', 'Sin detección', 'No CV Result', 'Unknown', '', null]) {
    assert.equal(rules.isValidSpecies(species), false)
  }
  assert.equal(rules.isValidSpecies('South American Coati'), true)
})

test('counts only valid species with confidence as positive detections', () => {
  assert.equal(rules.isPositiveDetection({ species: 'Unknown', confidence: 99 }), false)
  assert.equal(rules.isPositiveDetection({ species: 'South American Coati', confidence: 0 }), false)
  assert.equal(rules.isPositiveDetection({ species: 'South American Coati', confidence: 88 }), true)
})

test('classifies Unknown and no fauna labels as without detection for summary consistency', () => {
  assert.equal(rules.isWithoutDetection({ species: 'Unknown', confidence: 1.96 }), true)
  assert.equal(rules.isWithoutDetection({ species: 'No CV Result', confidence: 20 }), true)
  assert.equal(rules.isWithoutDetection({ species: 'Sin deteccion', confidence: 0 }), true)
})

test('requires manual review for invalid or low-confidence results', () => {
  assert.equal(rules.shouldRequireManualReview({ species: 'Unknown', confidence: 99 }), true)
  assert.equal(rules.shouldRequireManualReview({ species: 'South American Coati', confidence: 90, priority: 'Normal' }), false)
  assert.equal(rules.shouldRequireManualReview({ species: 'South American Coati', confidence: 90, priority: 'Revision manual' }), true)
})

test('requires manual review for broad taxonomic labels', () => {
  for (const species of ['Mammal', 'Rodent', 'Leopardus Species', 'Possum Family', 'Bird']) {
    assert.equal(rules.isBroadSpeciesLabel(species), true)
    assert.equal(rules.shouldRequireManualReview({ species, confidence: 85, priority: 'Normal' }), true)
  }
})
