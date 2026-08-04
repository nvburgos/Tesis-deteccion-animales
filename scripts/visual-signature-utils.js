const sharp = require('sharp')

function hasUsableBox(detection) {
  return [detection.x1, detection.y1, detection.x2, detection.y2].every((value) => Number.isFinite(Number(value))) &&
    Number(detection.x2) > Number(detection.x1) &&
    Number(detection.y2) > Number(detection.y1)
}

function cosineSimilarity(left, right) {
  if (!left?.length || !right?.length || left.length !== right.length) return null
  let dot = 0
  let leftNorm = 0
  let rightNorm = 0

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index]
    leftNorm += left[index] ** 2
    rightNorm += right[index] ** 2
  }

  if (!leftNorm || !rightNorm) return null
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))
}

function normalizeVector(values) {
  if (!values.length) return values
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  const deviation = Math.sqrt(variance) || 1

  return values.map((value) => Number(((value - mean) / deviation).toFixed(4)))
}

function getCropBounds(metadata, detection) {
  if (!metadata.width || !metadata.height) return null

  const paddingX = Math.max(4, (Number(detection.x2) - Number(detection.x1)) * 0.08)
  const paddingY = Math.max(4, (Number(detection.y2) - Number(detection.y1)) * 0.08)
  const left = Math.max(0, Math.floor(Number(detection.x1) - paddingX))
  const top = Math.max(0, Math.floor(Number(detection.y1) - paddingY))
  const right = Math.min(metadata.width, Math.ceil(Number(detection.x2) + paddingX))
  const bottom = Math.min(metadata.height, Math.ceil(Number(detection.y2) + paddingY))

  return {
    height: Math.max(1, bottom - top),
    left,
    top,
    width: Math.max(1, right - left)
  }
}

function buildTextureFeatures(raw, size) {
  const features = []
  const cells = 4
  const cellSize = size / cells

  for (let cellY = 0; cellY < cells; cellY += 1) {
    for (let cellX = 0; cellX < cells; cellX += 1) {
      const values = []
      for (let y = cellY * cellSize; y < (cellY + 1) * cellSize; y += 1) {
        for (let x = cellX * cellSize; x < (cellX + 1) * cellSize; x += 1) {
          values.push(raw[y * size + x])
        }
      }
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length
      const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
      features.push(mean / 255, Math.sqrt(variance) / 128)
    }
  }

  return features
}

function buildEdgeFeatures(raw, size) {
  const features = []
  const cells = 4
  const cellSize = size / cells

  for (let cellY = 0; cellY < cells; cellY += 1) {
    for (let cellX = 0; cellX < cells; cellX += 1) {
      let total = 0
      let count = 0
      for (let y = Math.max(1, cellY * cellSize); y < Math.min(size - 1, (cellY + 1) * cellSize); y += 1) {
        for (let x = Math.max(1, cellX * cellSize); x < Math.min(size - 1, (cellX + 1) * cellSize); x += 1) {
          const gx = raw[y * size + x + 1] - raw[y * size + x - 1]
          const gy = raw[(y + 1) * size + x] - raw[(y - 1) * size + x]
          total += Math.sqrt(gx ** 2 + gy ** 2)
          count += 1
        }
      }
      features.push(count ? total / count / 255 : 0)
    }
  }

  return features
}

function buildColorFeatures(raw) {
  const bins = 8
  const histograms = [Array(bins).fill(0), Array(bins).fill(0), Array(bins).fill(0)]
  const pixelCount = Math.max(1, raw.length / 3)

  for (let index = 0; index < raw.length; index += 3) {
    histograms[0][Math.min(bins - 1, Math.floor(raw[index] / 32))] += 1
    histograms[1][Math.min(bins - 1, Math.floor(raw[index + 1] / 32))] += 1
    histograms[2][Math.min(bins - 1, Math.floor(raw[index + 2] / 32))] += 1
  }

  return histograms.flat().map((value) => value / pixelCount)
}

async function buildSignatureForOrientation(filePath, bounds, mirror) {
  const base = sharp(filePath, { failOn: 'none' }).extract(bounds).resize(32, 32, { fit: 'fill' })
  const oriented = mirror ? base.flop() : base
  const [greyscale, color] = await Promise.all([
    oriented.clone().greyscale().raw().toBuffer(),
    oriented.clone().removeAlpha().raw().toBuffer()
  ])
  const pixelFeatures = normalizeVector(Array.from(greyscale, (value) => value / 255))

  return normalizeVector([
    ...pixelFeatures,
    ...buildTextureFeatures(greyscale, 32),
    ...buildEdgeFeatures(greyscale, 32),
    ...buildColorFeatures(color)
  ])
}

async function buildVisualDescriptor(filePath, detection, mirror = false) {
  if (!filePath || !hasUsableBox(detection)) return null

  const metadata = await sharp(filePath, { failOn: 'none' }).metadata()
  const bounds = getCropBounds(metadata, detection)
  if (!bounds) return null

  const base = sharp(filePath, { failOn: 'none' }).extract(bounds).resize(32, 32, { fit: 'fill' })
  const oriented = mirror ? base.flop() : base
  const [greyscale, color] = await Promise.all([
    oriented.clone().greyscale().raw().toBuffer(),
    oriented.clone().removeAlpha().raw().toBuffer()
  ])

  return {
    color: buildColorFeatures(color),
    edge: buildEdgeFeatures(greyscale, 32),
    spatial: normalizeVector(Array.from(greyscale, (value) => value / 255)),
    texture: buildTextureFeatures(greyscale, 32)
  }
}

function toPercentSimilarity(value) {
  return value === null ? null : Math.max(0, Math.min(1, value))
}

function compareDescriptors(left, right) {
  if (!left || !right) return null

  const color = toPercentSimilarity(cosineSimilarity(left.color, right.color))
  const texture = toPercentSimilarity(cosineSimilarity(left.texture, right.texture))
  const edge = toPercentSimilarity(cosineSimilarity(left.edge, right.edge))
  const spatial = toPercentSimilarity(cosineSimilarity(left.spatial, right.spatial))

  if (color === null || texture === null || edge === null || spatial === null) return null

  return (color * 0.5) + (texture * 0.25) + (edge * 0.15) + (spatial * 0.1)
}

async function buildVisualSignature(filePath, detection, mirror = false) {
  if (!filePath || !hasUsableBox(detection)) return null

  const image = sharp(filePath, { failOn: 'none' })
  const metadata = await image.metadata()
  const bounds = getCropBounds(metadata, detection)

  return bounds ? buildSignatureForOrientation(filePath, bounds, mirror) : null
}

async function compareDetectionCrops(leftPath, leftDetection, rightPath, rightDetection) {
  const [leftDescriptor, rightDescriptor, mirroredRightDescriptor] = await Promise.all([
    buildVisualDescriptor(leftPath, leftDetection),
    buildVisualDescriptor(rightPath, rightDetection),
    buildVisualDescriptor(rightPath, rightDetection, true)
  ])
  const similarity = Math.max(
    compareDescriptors(leftDescriptor, rightDescriptor) ?? -1,
    compareDescriptors(leftDescriptor, mirroredRightDescriptor) ?? -1
  )

  return similarity < 0 ? null : Math.round(Math.max(0, Math.min(1, similarity)) * 100)
}

module.exports = {
  buildVisualSignature,
  compareDetectionCrops,
  cosineSimilarity,
  hasUsableBox
}
