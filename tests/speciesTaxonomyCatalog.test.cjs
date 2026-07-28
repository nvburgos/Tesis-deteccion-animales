const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

function transpileTs(relativePath, localRequire, exportNames) {
  const filename = path.join(process.cwd(), relativePath)
  let source = fs.readFileSync(filename, 'utf8')
  source = source.replace(/export const /g, 'const ')
  source = source.replace(/export function /g, 'function ')
  source += `\nmodule.exports = { ${exportNames.join(', ')} }\n`

  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const module = { exports: {} }
  Function('require', 'module', 'exports', compiled)(localRequire, module, module.exports)
  return module.exports
}

function loadCatalog() {
  return transpileTs('src/lib/ecuadorSpeciesCatalog.ts', require, [
    'ecuadorSpeciesCatalog',
    'ecuadorSpeciesCatalogGeneratedAt',
  ])
}

function loadSpeciesTaxonomy() {
  const catalog = loadCatalog()
  return transpileTs(
    'src/lib/speciesTaxonomy.ts',
    (specifier) => {
      if (specifier === './ecuadorSpeciesCatalog') {
        return catalog
      }

      return require(specifier)
    },
    ['getTaxonomicGroup', 'getSpeciesSuggestion', 'speciesSuggestions']
  )
}

test('loads the generated Ecuador species catalog by taxonomic group', () => {
  const { ecuadorSpeciesCatalog } = loadCatalog()
  const groups = new Set(ecuadorSpeciesCatalog.map((entry) => entry.group))

  assert.equal(groups.has('Mamifero'), true)
  assert.equal(groups.has('Ave'), true)
  assert.equal(groups.has('Reptil'), true)
  assert.ok(ecuadorSpeciesCatalog.length > 2000)
})

test('uses catalog scientific names in taxonomy and manual review suggestions', () => {
  const taxonomy = loadSpeciesTaxonomy()

  assert.equal(taxonomy.getTaxonomicGroup('Panthera onca'), 'Mamifero')
  assert.equal(taxonomy.getTaxonomicGroup('Ara ambiguus'), 'Ave')
  assert.equal(taxonomy.getSpeciesSuggestion('Panthera onca')?.group, 'Mamifero')
  assert.equal(taxonomy.speciesSuggestions.some((suggestion) => suggestion.value === 'Ara ambiguus'), true)
})
