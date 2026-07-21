export type TaxonomicGroup = 'Mamifero' | 'Ave' | 'Reptil' | 'Anfibio' | 'Insecto' | 'Otro' | 'Sin clasificar'

const taxonomyCatalog: Array<{ group: TaxonomicGroup; terms: string[] }> = [
  {
    group: 'Mamifero',
    terms: [
      'agouti', 'armadillo', 'coati', 'deer', 'dog', 'jaguar', 'leopard', 'margay', 'ocelot', 'paca',
      'peccary', 'puma', 'spectacled bear', 'tapir', 'tayra', 'south american coati', 'rodent',
      'muridae family', 'cat family', 'leopardus species', 'felino', 'roedor', 'guatusa', 'armadillo',
      'coati', 'venado', 'jaguar', 'tigrillo', 'ocelote', 'guanta', 'pecari', 'puma', 'oso de anteojos',
      'tapir', 'cabeza de mate'
    ]
  },
  {
    group: 'Ave',
    terms: ['bird', 'ave', 'columbidae family', 'paloma']
  },
  {
    group: 'Reptil',
    terms: ['reptile', 'boa', 'iguana', 'snake', 'serpiente', 'lagarto', 'lizard', 'turtle', 'tortuga']
  },
  {
    group: 'Anfibio',
    terms: ['amphibian', 'frog', 'toad', 'rana', 'sapo']
  },
  {
    group: 'Insecto',
    terms: ['insect', 'insecto', 'butterfly', 'mariposa', 'beetle', 'escarabajo']
  }
]

const noClassificationTerms = new Set([
  '',
  'sin deteccion',
  'sin detección',
  'no detection',
  'no cv result',
  'unknown',
  'desconocido'
])

export const taxonomicGroups: TaxonomicGroup[] = ['Mamifero', 'Ave', 'Reptil', 'Anfibio', 'Insecto', 'Otro', 'Sin clasificar']

export function normalizeTaxonomyKey(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]/g, ' ')
    .toLowerCase()
    .trim()
}

export function isFaunaSpecies(species: string | null | undefined, confidence = 0) {
  const normalized = normalizeTaxonomyKey(species)
  return Boolean(normalized && !noClassificationTerms.has(normalized) && confidence > 0)
}

export function getTaxonomicGroup(species: string | null | undefined): TaxonomicGroup {
  const normalized = normalizeTaxonomyKey(species)

  if (!normalized || noClassificationTerms.has(normalized)) {
    return 'Sin clasificar'
  }

  const match = taxonomyCatalog.find((entry) => entry.terms.some((term) => normalized.includes(term)))
  return match?.group ?? 'Sin clasificar'
}

export type SpeciesSuggestion = {
  label: string
  value: string
  group: TaxonomicGroup
  rawLabel?: string
}

export const speciesSuggestions: SpeciesSuggestion[] = [
  { label: 'South American Coati', value: 'South American Coati', group: 'Mamifero', rawLabel: 'South American Coati' },
  { label: 'Cabeza de mate', value: 'Tayra', group: 'Mamifero', rawLabel: 'Tayra' },
  { label: 'Ocelote', value: 'Ocelot', group: 'Mamifero', rawLabel: 'Ocelot' },
  { label: 'Jaguar', value: 'Jaguar', group: 'Mamifero', rawLabel: 'Jaguar' },
  { label: 'Puma', value: 'Puma', group: 'Mamifero', rawLabel: 'Puma' },
  { label: 'Tapir', value: 'Tapir', group: 'Mamifero', rawLabel: 'Tapir' },
  { label: 'Pecari', value: 'Peccary', group: 'Mamifero', rawLabel: 'Peccary' },
  { label: 'Guanta', value: 'Paca', group: 'Mamifero', rawLabel: 'Paca' },
  { label: 'Guatusa', value: 'Agouti', group: 'Mamifero', rawLabel: 'Agouti' },
  { label: 'Roedor', value: 'Rodent', group: 'Mamifero', rawLabel: 'Rodent' },
  { label: 'Muridae Family', value: 'Muridae Family', group: 'Mamifero', rawLabel: 'Muridae Family' },
  { label: 'Cat Family', value: 'Cat Family', group: 'Mamifero', rawLabel: 'Cat Family' },
  { label: 'Leopardus Species', value: 'Leopardus Species', group: 'Mamifero', rawLabel: 'Leopardus Species' },
  { label: 'Ave', value: 'Bird', group: 'Ave', rawLabel: 'Bird' },
  { label: 'Columbidae Family', value: 'Columbidae Family', group: 'Ave', rawLabel: 'Columbidae Family' },
  { label: 'Boa', value: 'Boa', group: 'Reptil' },
  { label: 'Iguana', value: 'Iguana', group: 'Reptil' },
  { label: 'Serpiente', value: 'Snake', group: 'Reptil' },
  { label: 'Rana', value: 'Frog', group: 'Anfibio' },
  { label: 'Insecto', value: 'Insect', group: 'Insecto' },
  { label: 'Sin fauna', value: 'Sin deteccion', group: 'Sin clasificar', rawLabel: 'Sin deteccion' },
  { label: 'Especie no identificada', value: 'Unknown', group: 'Sin clasificar', rawLabel: 'Unknown' },
  { label: 'Imagen no evaluable', value: 'Imagen no evaluable', group: 'Sin clasificar' }
]

export function getSpeciesSuggestion(value: string | null | undefined) {
  const normalized = normalizeTaxonomyKey(value)
  return speciesSuggestions.find((suggestion) => normalizeTaxonomyKey(suggestion.value) === normalized || normalizeTaxonomyKey(suggestion.label) === normalized)
}