import { inject } from 'vitest'
import { assertTestDatabase } from './guard'

// Runs before each integration file imports src/, so db/client.ts builds its
// Pool against the test database rather than whatever .env holds.
const url = inject('databaseUrl')
assertTestDatabase(url)
process.env.DATABASE_URL = url
