const assert = require('node:assert/strict')
const { mkdtemp, writeFile } = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const sharp = require('sharp')
const { compareDetectionCrops } = require('../scripts/visual-signature-utils')

async function makePatternImage(filePath, pattern) {
  const size = 96
  const channels = 3
  const pixels = Buffer.alloc(size * size * channels)

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * channels
      const marked = pattern === 'spots'
        ? ((x - 30) ** 2 + (y - 32) ** 2 < 80) || ((x - 62) ** 2 + (y - 58) ** 2 < 110)
        : Math.floor(x / 8) % 2 === 0
      pixels[index] = marked ? 35 : 190
      pixels[index + 1] = marked ? 30 : 150
      pixels[index + 2] = marked ? 25 : 95
    }
  }

  await sharp(pixels, { raw: { width: size, height: size, channels } }).jpeg().toFile(filePath)
}

test('visual signature gives high similarity for the same animal crop', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'visual-signature-'))
  const imagePath = path.join(tempDir, 'spots.jpg')
  await makePatternImage(imagePath, 'spots')

  const detection = { x1: 10, y1: 10, x2: 86, y2: 86 }
  const similarity = await compareDetectionCrops(imagePath, detection, imagePath, detection)

  assert.equal(similarity, 100)
})

test('visual signature separates different body patterns', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'visual-signature-'))
  const spottedPath = path.join(tempDir, 'spots.jpg')
  const stripedPath = path.join(tempDir, 'stripes.jpg')
  await writeFile(path.join(tempDir, '.keep'), '')
  await makePatternImage(spottedPath, 'spots')
  await makePatternImage(stripedPath, 'stripes')

  const detection = { x1: 10, y1: 10, x2: 86, y2: 86 }
  const similarity = await compareDetectionCrops(spottedPath, detection, stripedPath, detection)

  assert.ok(similarity !== null && similarity < 80, `expected separated patterns below 80%, got ${similarity}`)
})
