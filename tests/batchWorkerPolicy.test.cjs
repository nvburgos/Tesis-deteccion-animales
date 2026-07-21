const test = require('node:test')
const assert = require('node:assert/strict')
const {
  canRetryBatch,
  getFinalFailureError,
  getRetryError,
  getStaleCutoff,
  getWorkerConfig,
  parsePositiveInt,
  shouldFailStaleBatch
} = require('../scripts/batch-worker-utils')

test('worker config uses conservative defaults', () => {
  const config = getWorkerConfig({})
  assert.equal(config.heartbeatSeconds, 10)
  assert.equal(config.maxAttempts, 3)
  assert.equal(config.staleMinutes, 15)
  assert.ok(config.workerId.length > 0)
})

test('worker config accepts explicit values', () => {
  const config = getWorkerConfig({
    BATCH_STALE_MINUTES: '7',
    MAX_BATCH_ATTEMPTS: '2',
    WORKER_HEARTBEAT_SECONDS: '5',
    WORKER_ID: 'worker-test'
  })
  assert.equal(config.staleMinutes, 7)
  assert.equal(config.maxAttempts, 2)
  assert.equal(config.heartbeatSeconds, 5)
  assert.equal(config.workerId, 'worker-test')
})

test('stale batches retry until max attempts', () => {
  assert.equal(canRetryBatch({ attempts: 0 }, 3), true)
  assert.equal(canRetryBatch({ attempts: 2 }, 3), true)
  assert.equal(canRetryBatch({ attempts: 3 }, 3), false)
  assert.equal(shouldFailStaleBatch({ attempts: 3 }, 3), true)
})

test('stale cutoff subtracts configured minutes', () => {
  const now = new Date('2026-07-19T12:00:00.000Z')
  assert.equal(getStaleCutoff(now, 15).toISOString(), '2026-07-19T11:45:00.000Z')
})

test('retry and final failure messages include attempt context', () => {
  assert.match(getRetryError({ attempts: 1 }, 15), /Intentos previos: 1/)
  assert.match(getFinalFailureError({ attempts: 3 }, 15, 3), /3\/3/)
})

test('parsePositiveInt rejects invalid values', () => {
  assert.equal(parsePositiveInt('0', 9), 9)
  assert.equal(parsePositiveInt('-1', 9), 9)
  assert.equal(parsePositiveInt('abc', 9), 9)
  assert.equal(parsePositiveInt('12', 9), 12)
})