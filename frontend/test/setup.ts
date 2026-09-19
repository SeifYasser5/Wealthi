import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'
import { api, server } from './server'

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
  // The app calls fetch('/api/…') like a browser would; Node's fetch needs an
  // absolute URL, so resolve against the jsdom page. Wrapped after listen() so
  // the call still goes through MSW's interceptor.
  const intercepted = globalThis.fetch
  globalThis.fetch = (input, init) =>
    intercepted(typeof input === 'string' ? new URL(input, window.location.href) : input, init)
})
beforeEach(() => api.reset())
afterEach(() => {
  cleanup()
  server.resetHandlers()
})
afterAll(() => server.close())
