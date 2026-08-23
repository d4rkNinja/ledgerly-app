import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    // Tests assert contracts against the authorized deployed HTTP API, so the
    // base URL is pinned here instead of relying on uncommitted .env files.
    env: {
      VITE_API_BASE_URL: 'http://80.225.194.189:3001/api/v1',
    },
    testTimeout: 10_000,
    exclude: [
      '../applications/android/scripts/__tests__/**',
      '**/node_modules/**',
      '**/.git/**',
    ],
    setupFiles: ['./src/test/setup.ts'],
    mockReset: true,
    passWithNoTests: true,
    coverage: {
      include: ['src/platform/**/*.{ts,tsx}', 'src/**/*.integration.{ts,tsx}'],
    },
  },
})
