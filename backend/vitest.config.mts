import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Every run loads the synthetic fixtures, never config/wealthi.json or your
// learned patterns. Set before any src module loads, since config is read at import.
const env = {
  NODE_ENV: 'test',
  // Month bucketing uses local time; pin it so results don't depend on the machine.
  TZ: 'UTC',
  WEALTHI_CONFIG_PATH: resolve(import.meta.dirname, 'test/fixtures/wealthi.test.json'),
  WEALTHI_PATTERNS_DIR: resolve(import.meta.dirname, 'test/fixtures/patterns'),
}

export default defineConfig({
  test: {
    env,
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      // A drop below these fails the run (npm run test:coverage, and CI).
      // Raise them as coverage grows; never lower them to make a change pass.
      thresholds: { lines: 99.8, statements: 99.5, functions: 100, branches: 96.5 },
    },
    projects: [
      {
        test: {
          name: 'unit',
          env,
          include: ['test/unit/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          env,
          include: ['test/integration/**/*.test.ts'],
          // One Postgres for the whole run: a Testcontainers instance, or TEST_DATABASE_URL.
          globalSetup: ['test/setup/postgres.ts'],
          setupFiles: ['test/setup/database-url.ts'],
          // The importer wipes and rebuilds whole tables, so files must not overlap.
          fileParallelism: false,
          hookTimeout: 120_000,
          testTimeout: 30_000,
        },
      },
    ],
  },
})
