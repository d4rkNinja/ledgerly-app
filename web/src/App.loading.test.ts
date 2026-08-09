import { expect, it } from 'vitest'
import source from './App.tsx?raw'

it('does not load authenticated page modules during cold app startup', () => {
  expect(source).not.toMatch(
    /import\s+\{[^}]*AccountsPage[^}]*\}\s+from\s+['"]@\/pages\/finance\/accounts['"]/,
  )
  expect(source).toContain("import('@/pages/finance/accounts')")
})
