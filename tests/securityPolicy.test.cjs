const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

function loadTsModule(relativePath, replacements = {}, exportNames = []) {
  const filename = path.join(process.cwd(), relativePath)
  let source = fs.readFileSync(filename, 'utf8')
  for (const [from, to] of Object.entries(replacements)) {
    source = source.replace(from, to)
  }
  source = source.replace(/export const /g, 'const ')
  source = source.replace(/export function /g, 'function ')
  source = source.replace(/export type[\s\S]*?\r?\n\r?\n/g, '')
  source += `\nmodule.exports = { ${exportNames.join(', ')} }\n`
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const module = { exports: {} }
  Function('require', 'module', 'exports', compiled)(require, module, module.exports)
  return module.exports
}

const auth = loadTsModule('src/lib/auth.ts', {}, ['AUTH_COOKIE', 'ADMIN_ROLE', 'INVESTIGATOR_ROLE', 'createSessionValue', 'getSessionUserId', 'isValidSession', 'isAdminRole'])
const requestSecurity = loadTsModule(
  'src/lib/requestSecurity.ts',
  { "import { NextResponse } from 'next/server'": "const NextResponse = { json: (body, init) => ({ body, status: init?.status ?? 200 }) }" },
  ['verifySameOrigin', 'forbiddenByCsrf']
)
const rateLimit = loadTsModule('src/lib/rateLimit.ts', {}, ['getClientIp', 'checkRateLimit'])

test('auth signs sessions and rejects tampered values', () => {
  const previousSecret = process.env.AUTH_SECRET
  process.env.AUTH_SECRET = 'test-secret'
  try {
    const session = auth.createSessionValue(42)
    assert.equal(auth.getSessionUserId(session), 42)
    assert.equal(auth.isValidSession(session), true)
    assert.equal(auth.getSessionUserId(session.replace('42', '43')), null)
    assert.equal(auth.isAdminRole('Admin'), true)
    assert.equal(auth.isAdminRole('Investigador'), false)
  } finally {
    if (previousSecret === undefined) delete process.env.AUTH_SECRET
    else process.env.AUTH_SECRET = previousSecret
  }
})

test('auth requires AUTH_SECRET in production', () => {
  const previousSecret = process.env.AUTH_SECRET
  const previousNodeEnv = process.env.NODE_ENV
  delete process.env.AUTH_SECRET
  process.env.NODE_ENV = 'production'
  try {
    assert.throws(() => auth.createSessionValue(1), /AUTH_SECRET/)
  } finally {
    if (previousSecret === undefined) delete process.env.AUTH_SECRET
    else process.env.AUTH_SECRET = previousSecret
    process.env.NODE_ENV = previousNodeEnv
  }
})

test('same-origin verification accepts matching origins and rejects cross-site origins', () => {
  const goodRequest = new Request('http://localhost/api/test', { headers: { host: 'localhost', origin: 'http://localhost' } })
  const badRequest = new Request('http://localhost/api/test', { headers: { host: 'localhost', origin: 'https://attacker.example' } })
  const noOriginRequest = new Request('http://localhost/api/test', { headers: { host: 'localhost' } })

  assert.equal(requestSecurity.verifySameOrigin(goodRequest), true)
  assert.equal(requestSecurity.verifySameOrigin(noOriginRequest), true)
  assert.equal(requestSecurity.verifySameOrigin(badRequest), false)
  assert.equal(requestSecurity.forbiddenByCsrf().status, 403)
})

test('rate limiter blocks requests beyond the configured limit and resets by window', () => {
  const originalNow = Date.now
  let now = 1_000
  Date.now = () => now
  try {
    assert.deepEqual(rateLimit.checkRateLimit('test-key', 2, 1_000).allowed, true)
    assert.deepEqual(rateLimit.checkRateLimit('test-key', 2, 1_000).allowed, true)
    assert.deepEqual(rateLimit.checkRateLimit('test-key', 2, 1_000).allowed, false)
    now = 2_001
    assert.deepEqual(rateLimit.checkRateLimit('test-key', 2, 1_000).allowed, true)
  } finally {
    Date.now = originalNow
  }
})

test('client IP prefers x-forwarded-for and falls back to x-real-ip', () => {
  const forwarded = new Request('http://localhost', { headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' } })
  const realIp = new Request('http://localhost', { headers: { 'x-real-ip': '10.0.0.3' } })
  assert.equal(rateLimit.getClientIp(forwarded), '10.0.0.1')
  assert.equal(rateLimit.getClientIp(realIp), '10.0.0.3')
})