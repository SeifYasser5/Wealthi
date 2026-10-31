import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Serving the built frontend (WEALTHI_STATIC_DIR), as the demo deployment does.
// app.ts reads the variable at import, so each test loads a fresh copy.

vi.mock('../../src/db/health', () => ({ isDbConnected: async () => true }))

const dist = mkdtempSync(join(tmpdir(), 'wealthi-dist-'))
mkdirSync(join(dist, 'assets'))
writeFileSync(join(dist, 'index.html'), '<!doctype html><title>Wealthi</title>')
writeFileSync(join(dist, 'assets', 'app.js'), 'console.log(1)')
afterAll(() => rmSync(dist, { recursive: true, force: true }))

beforeEach(() => vi.resetModules())
afterEach(() => vi.unstubAllEnvs())

async function load(staticDir: string | undefined) {
  vi.stubEnv('WEALTHI_STATIC_DIR', staticDir)
  return (await import('../../src/app')).default
}

describe('serving the frontend', () => {
  it('serves the app shell at / and on every client-side route', async () => {
    const app = await load(dist)
    for (const path of ['/', '/transactions', '/balances?yearMonth=2026-01', '/apiary']) {
      const res = await request(app).get(path).expect(200)
      expect(res.text).toContain('<title>Wealthi</title>')
    }
  })

  it('serves built assets as files', async () => {
    const app = await load(dist)
    const res = await request(app).get('/assets/app.js').expect(200)
    expect(res.headers['content-type']).toMatch(/javascript/)
  })

  it('leaves the API alone: real routes answer, unknown ones stay a 404', async () => {
    const app = await load(dist)
    expect((await request(app).get('/api/health').expect(200)).body).toMatchObject({ db: 'connected' })
    const res = await request(app).get('/api/nope').expect(404)
    expect(res.text).not.toContain('<title>Wealthi</title>')
  })

  it('serves no frontend unless WEALTHI_STATIC_DIR is set', async () => {
    const app = await load(undefined)
    await request(app).get('/').expect(404)
  })
})
