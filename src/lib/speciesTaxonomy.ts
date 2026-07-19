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
