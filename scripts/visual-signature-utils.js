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

async function buildVisualSignature(filePath, detection) {
  if (!filePath || !hasUsableBox(detection)) return null

  const image = sharp(filePath, { failOn: 'none' })
  const metadata = await image.metadata()

  if (!metadata.width || !metadata.height) return null

  const paddingX = Math.max(4, (Number(detection.x2) - Number(detection.x1)) * 0.08)
  const paddingY = Math.max(4, (Number(detection.y2) - Number(detection.y1)) * 0.08)
  const left = Math.max(0, Math.floor(Number(detection.x1) - paddingX))
  const top = Math.max(0, Math.floor(Number(detection.y1) - paddingY))
  const right = Math.min(metadata.width, Math.ceil(Number(detection.x2) + paddingX))
  const bottom = Math.min(metadata.height, Math.ceil(Number(detection.y2) + paddingY))
  const width = Math.max(1, right - left)
  const height = Math.max(1, bottom - top)

  const raw = await sharp(filePath, { failOn: 'none' })
    .extract({ left, top, width, height })
    .resize(16, 16, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer()

  const mean = raw.reduce((sum, value) => sum + value, 0) / Math.max(1, raw.length)
  const variance = raw.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, raw.length)
  const deviation = Math.sqrt(variance) || 1

  return Array.from(raw, (value) => Number(((value - mean) / deviation).toFixed(4)))
}

async function compareDetectionCrops(leftPath, leftDetection, rightPath, rightDetection) {
  const [leftSignature, rightSignature] = await Promise.all([
    buildVisualSignature(leftPath, leftDetection),
    buildVisualSignature(rightPath, rightDetection)
  ])
  const similarity = cosineSimilarity(leftSignature, rightSignature)

  return similarity === null ? null : Math.round(Math.max(0, Math.min(1, similarity)) * 100)
}

module.exports = {
  buildVisualSignature,
  compareDetectionCrops,
  cosineSimilarity,
  hasUsableBox
}
