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
