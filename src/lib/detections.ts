export const threatenedSpecies = new Set([
  'jaguar',
  'leopard',
  'tapir amazonico',
  'puma',
  'ocelot',
  'oso de anteojos',
  'pecari'
])

export function normalizeSpecies(species: string) {
  return species
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function calculatePriority(species: string, confidence: number) {
  const normalizedSpecies = normalizeSpecies(species)

  if (normalizedSpecies === 'sin deteccion' || confidence <= 0) {
    return 'Revision manual'
  }

  if (threatenedSpecies.has(normalizedSpecies) || confidence > 95) {
    return 'Alta prioridad'
  }

  return 'Normal'
}

export function formatRelativeDate(value: Date | string) {
  const date = typeof value === 'string' ? new Date(value) : value
  const diff = Date.now() - date.getTime()
  const minutes = Math.max(0, Math.floor(diff / 60000))

  if (minutes < 1) {
    return 'Ahora'
  }

  if (minutes < 60) {
    return `Hace ${minutes} min`
  }

  const hours = Math.floor(minutes / 60)

  if (hours < 24) {
    return `Hace ${hours} hora${hours === 1 ? '' : 's'}`
  }

  const days = Math.floor(hours / 24)
  return `Hace ${days} dia${days === 1 ? '' : 's'}`
}
