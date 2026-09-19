import { defineConfig, mergeConfig } from 'vitest/config'
import base from './vitest.config.mts'

// Stryker reruns the tests once per mutant, so it gets the unit project only:
// no Docker, no database, and the pure logic is where mutants matter.
const unit = base.test!.projects![0] as { test: object }

export default mergeConfig({ test: { env: base.test!.env } }, defineConfig(unit))
