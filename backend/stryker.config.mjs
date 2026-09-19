// @ts-check
/**
 * Mutation testing: Stryker changes the code (flips a `<`, drops a branch,
 * empties a string) and checks that some unit test fails for each change.
 * A surviving mutant is behaviour no test pins down.
 *
 *   npm run test:mutation      # report in reports/mutation/mutation.html
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  // The command runner, not @stryker-mutator/vitest-runner: under Vitest 5 that
  // runner never switches mutants on (every mutant "survives"). The command
  // runner passes the mutant through __STRYKER_ACTIVE_MUTANT__, which the
  // instrumented code reads directly. Slower (whole unit suite per mutant) but
  // independent of Vitest internals.
  testRunner: 'command',
  commandRunner: { command: 'npx vitest run --config vitest.stryker.config.mts --bail 1 --reporter dot' },
  // The pure logic the unit tests own. DB-, server- and CLI-level code is
  // covered by the integration project, which is too slow to run per mutant.
  mutate: [
    'src/services/patterns/**/*.ts',
    'src/services/ingest/{balance,decode,parser,transfer}.ts',
    'src/services/spending.ts',
    'src/utils/helpers/**/*.ts',
    'src/utils/categories.ts',
    'src/utils/config/schema.ts',
    'src/validation/**/*.ts',
  ],
  // Stryker copies the project into a sandbox: keep your chat.db, private
  // config and learned patterns out of it. Tests only need the committed example.
  ignorePatterns: ['data', 'config/*', '!config/wealthi.example.json', 'reports', 'coverage', 'dist'],
  coverageAnalysis: 'off',
  reporters: ['clear-text', 'progress', 'html'],
  htmlReporter: { fileName: 'reports/mutation/mutation.html' },
  // Score was 92.6% when this was set; most survivors left are equivalent
  // mutants (caches, depth guards, alternative LCS alignments). Fails below 90.
  thresholds: { high: 95, low: 85, break: 90 },
  tempDirName: '.stryker-tmp',
}
