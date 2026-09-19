import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Set here, in the parent process, so every forked test worker starts with them:
// money and dates render through the default Intl locale and time zone.
process.env.TZ = 'UTC'
process.env.LC_ALL = 'en_US.UTF-8'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['test/setup.ts'],
    // CSS is Tailwind classes only; nothing asserts on computed styles.
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/main.tsx', 'src/**/index.ts'],
      // Everything is covered today; a change that drops any line or branch fails the run.
      thresholds: { 100: true },
    },
  },
})
