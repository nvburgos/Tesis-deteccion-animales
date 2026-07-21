const assert = require('node:assert/strict')
const { execFileSync, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wildlife-zip-test-'))
}

function makeZip(zipPath, entries) {
  const script = `
import sys, zipfile
zip_path = sys.argv[1]
entries = ${JSON.stringify(entries)}
with zipfile.ZipFile(zip_path, 'w') as archive:
    for name, content in entries:
        archive.writestr(name, content)
`
  execFileSync('python', ['-c', script, zipPath])
}

function runSafeZip(args, env = {}) {
  return spawnSync('python', ['python/safe_zip.py', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, ...env }
  })
}

test('safe_zip accepts a valid image zip', () => {
  const dir = makeTempDir()
  const zipPath = path.join(dir, 'valid.zip')
  makeZip(zipPath, [['camera/image01.jpg', 'fake image bytes']])
  const result = runSafeZip(['inspect', zipPath])
  assert.equal(result.status, 0, result.stderr)
  const parsed = JSON.parse(result.stdout)
  assert.equal(parsed.ok, true)
  assert.equal(parsed.imageCount, 1)
})

test('safe_zip rejects path traversal entries', () => {
  const dir = makeTempDir()
  const zipPath = path.join(dir, 'traversal.zip')
  makeZip(zipPath, [['../escape.jpg', 'fake image bytes']])
  const result = runSafeZip(['inspect', zipPath])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Path traversal/)
})

test('safe_zip rejects non image files', () => {
  const dir = makeTempDir()
  const zipPath = path.join(dir, 'invalid-extension.zip')
  makeZip(zipPath, [['notes.txt', 'not an image']])
  const result = runSafeZip(['inspect', zipPath])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Extension no permitida/)
})
