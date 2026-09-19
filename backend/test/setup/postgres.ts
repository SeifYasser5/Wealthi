import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { TestProject } from 'vitest/node'
import { assertTestDatabase } from './guard'

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string
  }
}

/**
 * Provides a Postgres for the integration project and pushes the Prisma schema.
 *
 * By default it starts a throwaway postgres:16 container (needs Docker). Set
 * TEST_DATABASE_URL to use an existing server instead — e.g. a CI service
 * container. Either way the database must be named *_test. The schema push is
 * additive (no --force-reset): each test file's import wipes the tables it uses.
 */
export default async function setup(project: TestProject) {
  let container: StartedPostgreSqlContainer | undefined
  let url = process.env.TEST_DATABASE_URL

  if (!url) {
    container = await new PostgreSqlContainer('postgres:16-alpine').withDatabase('wealthi_test').start()
    url = container.getConnectionUri()
  }
  assertTestDatabase(url)

  execFileSync('npx', ['prisma', 'db', 'push'], {
    cwd: resolve(__dirname, '../..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  })

  project.provide('databaseUrl', url)

  return async () => {
    await container?.stop()
  }
}
