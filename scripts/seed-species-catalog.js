const { existsSync, readFileSync } = require('node:fs')
const path = require('node:path')
const { PrismaClient } = require('@prisma/client')

function loadDotenv() {
  const envPath = path.join(process.cwd(), '.env')
  if (!existsSync(envPath)) return

  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const [key, ...valueParts] = trimmed.split('=')
    const value = valueParts.join('=').trim().replace(/^['"]|['"]$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}

function parseCatalogEntries() {
  const catalogPath = path.join(process.cwd(), 'src', 'lib', 'ecuadorSpeciesCatalog.ts')
  const source = readFileSync(catalogPath, 'utf8')
  const entryPattern = /entry\('([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'(?:\s*,\s*'([^']+)')?\)/g
  const entries = []
  const seen = new Set()

  for (const match of source.matchAll(entryPattern)) {
    const [, scientificName, taxonomicGroup, catalogSource, conservationStatus] = match
    const key = scientificName.toLowerCase()

    if (seen.has(key)) continue
    seen.add(key)
    entries.push({
      conservationStatus: conservationStatus || null,
      scientificName,
      source: catalogSource,
      taxonomicGroup
    })
  }

  return entries
}

loadDotenv()

const prisma = new PrismaClient()

async function main() {
  const entries = parseCatalogEntries()
  let created = 0
  let updated = 0

  for (const entry of entries) {
    const existing = await prisma.species.findUnique({
      where: { scientificName: entry.scientificName },
      select: { id: true }
    })

    await prisma.species.upsert({
      where: { scientificName: entry.scientificName },
      create: {
        conservationStatus: entry.conservationStatus,
        scientificName: entry.scientificName,
        source: entry.source,
        taxonomicGroup: entry.taxonomicGroup
      },
      update: {
        conservationStatus: entry.conservationStatus,
        source: entry.source,
        taxonomicGroup: entry.taxonomicGroup
      }
    })

    if (existing) {
      updated += 1
    } else {
      created += 1
    }
  }

  const total = await prisma.species.count()
  console.log(JSON.stringify({ created, total, updated }, null, 2))
}

main()
  .catch((error) => {
    console.error('[species-seed] error fatal:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
