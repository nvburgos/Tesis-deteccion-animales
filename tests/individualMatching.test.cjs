const test = require('node:test')
const assert = require('node:assert/strict')
const {
  isEligibleForIndividualMatching,
  scoreIndividualCandidate
} = require('../scripts/individual-matching-utils')

test('excludes generic labels from individual matching', () => {
  assert.equal(isEligibleForIndividualMatching('Mammal', 80), false)
  assert.equal(isEligibleForIndividualMatching('Leopardus Species', 80), false)
  assert.equal(isEligibleForIndividualMatching('Rodent', 80), false)
  assert.equal(isEligibleForIndividualMatching('Ocelot', 80), true)
})

test('scores same camera and close capture time as probable reencounter', () => {
  const capturedAt = new Date('2026-07-27T10:00:00.000Z')
  const candidate = {
    cameraId: 1,
    camera: { id: 1, latitude: -2.18, longitude: -79.88, zone: 'Bosque' },
    capturedAt: new Date('2026-07-27T09:45:00.000Z'),
    confidence: 86,
    createdAt: capturedAt,
    id: 1,
    individualId: 7
  }
  const result = scoreIndividualCandidate({
    ...candidate,
    capturedAt,
    id: 2,
    individualId: null,
    species: 'Ocelot',
    userId: 1
  }, candidate)

  assert.equal(result.score >= 65, true)
  assert.deepEqual(result.basis.includes('misma camara en intervalo corto'), true)
})

test('does not treat same camera after many days as enough evidence', () => {
  const candidate = {
    cameraId: 1,
    camera: { id: 1, latitude: -2.18, longitude: -79.88, zone: 'Bosque' },
    capturedAt: new Date('2026-07-01T09:45:00.000Z'),
    confidence: 86,
    createdAt: new Date('2026-07-01T09:45:00.000Z'),
    id: 1,
    individualId: 7
  }
  const result = scoreIndividualCandidate({
    ...candidate,
    capturedAt: new Date('2026-07-14T10:00:00.000Z'),
    createdAt: new Date('2026-07-14T10:00:00.000Z'),
    id: 2,
    individualId: null,
    species: 'Ocelot',
    userId: 1
  }, candidate)

  assert.equal(result.score < 65, true)
  assert.equal(result.basis.includes('misma camara'), true)
})

test('penalizes distant cameras with weak time evidence', () => {
  const detection = {
    cameraId: 1,
    camera: { id: 1, latitude: -2.18, longitude: -79.88, zone: 'Norte' },
    capturedAt: new Date('2026-07-27T10:00:00.000Z'),
    confidence: 88,
    createdAt: new Date('2026-07-27T10:00:00.000Z'),
    id: 2,
    individualId: null,
    species: 'Ocelot',
    userId: 1
  }
  const candidate = {
    cameraId: 2,
    camera: { id: 2, latitude: -0.18, longitude: -78.47, zone: 'Sierra' },
    capturedAt: new Date('2026-07-15T10:00:00.000Z'),
    confidence: 90,
    createdAt: new Date('2026-07-15T10:00:00.000Z'),
    id: 1,
    individualId: 4
  }
  const result = scoreIndividualCandidate(detection, candidate)

  assert.equal(result.score < 65, true)
})

test('does not accept nearby cameras and timing without strong visual evidence', () => {
  const detection = {
    cameraId: 1,
    camera: { id: 1, latitude: -2.1800, longitude: -79.8800, zone: 'Bosque' },
    capturedAt: new Date('2026-07-27T10:00:00.000Z'),
    confidence: 88,
    createdAt: new Date('2026-07-27T10:00:00.000Z'),
    id: 2,
    individualId: null,
    species: 'Ocelot',
    userId: 1
  }
  const candidate = {
    cameraId: 2,
    camera: { id: 2, latitude: -2.1810, longitude: -79.8810, zone: 'Bosque' },
    capturedAt: new Date('2026-07-27T07:00:00.000Z'),
    confidence: 90,
    createdAt: new Date('2026-07-27T07:00:00.000Z'),
    id: 1,
    individualId: 4
  }
  const result = scoreIndividualCandidate(detection, candidate)

  assert.equal(result.score < 82, true)
})

test('adds visual evidence when crop pattern is similar', () => {
  const baseDetection = {
    cameraId: 1,
    camera: { id: 1, latitude: -2.18, longitude: -79.88, zone: 'Bosque' },
    capturedAt: new Date('2026-07-27T10:00:00.000Z'),
    confidence: 88,
    createdAt: new Date('2026-07-27T10:00:00.000Z'),
    id: 2,
    individualId: null,
    species: 'Ocelot',
    userId: 1
  }
  const withoutVisual = scoreIndividualCandidate(baseDetection, {
    ...baseDetection,
    capturedAt: new Date('2026-07-27T09:00:00.000Z'),
    id: 1,
    individualId: 4
  })
  const withVisual = scoreIndividualCandidate(baseDetection, {
    ...baseDetection,
    capturedAt: new Date('2026-07-27T09:00:00.000Z'),
    id: 1,
    individualId: 4,
    visualSimilarity: 86
  })

  assert.equal(withVisual.score > withoutVisual.score, true)
  assert.equal(withVisual.basis.includes('rasgos visuales y patron corporal similares 86%'), true)
})

test('penalizes visually different crop pattern', () => {
  const detection = {
    cameraId: 1,
    camera: { id: 1, latitude: -2.18, longitude: -79.88, zone: 'Bosque' },
    capturedAt: new Date('2026-07-27T10:00:00.000Z'),
    confidence: 88,
    createdAt: new Date('2026-07-27T10:00:00.000Z'),
    id: 2,
    individualId: null,
    species: 'Ocelot',
    userId: 1
  }
  const result = scoreIndividualCandidate(detection, {
    cameraId: 2,
    camera: { id: 2, latitude: -2.1810, longitude: -79.8810, zone: 'Bosque' },
    capturedAt: new Date('2026-07-27T07:00:00.000Z'),
    confidence: 90,
    createdAt: new Date('2026-07-27T07:00:00.000Z'),
    id: 1,
    individualId: 4,
    visualSimilarity: 25
  })

  assert.equal(result.basis.includes('rasgos visuales distintos 25%'), true)
})


test('uses visible camera code as supporting evidence only', () => {
  const capturedAt = new Date('2026-07-27T10:00:00.000Z')
  const candidate = {
    cameraId: null,
    cameraTrapCode: '0001',
    camera: null,
    capturedAt: new Date('2026-07-27T09:55:00.000Z'),
    confidence: 92,
    createdAt: capturedAt,
    id: 1,
    individualId: 8
  }
  const result = scoreIndividualCandidate({
    ...candidate,
    capturedAt,
    id: 2,
    individualId: null,
    species: 'Ocelot',
    userId: 1
  }, candidate)

  assert.equal(result.score < 82, true)
  assert.equal(result.basis.includes('mismo codigo visible de camara 0001 en intervalo corto'), true)
})
