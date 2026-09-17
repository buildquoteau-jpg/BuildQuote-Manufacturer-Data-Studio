import { defineConfig } from 'vitest/config'

// Unit-test config for the web app.
//
// Scope: pure, dependency-free modules (no DOM, no Supabase client, no network).
// The access rules (lib/studio/access.ts), the parser validator and insertion
// planner (lib/parser/validate.ts, lib/parser/map-to-staged.ts), the package
// readiness rules (lib/packages/readiness.ts) and the status vocabulary
// (lib/statuses.ts) are the primary targets — they encode the rules that decide
// who can see/do what and what ships in a package, so they must stay covered.
//
// `pnpm test:coverage` reports coverage for lib/ only; server actions and
// Supabase-backed loaders are out of scope until they get an integration
// harness.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
    // Keep CI output deterministic and fast.
    passWithNoTests: false,
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.ts'],
      exclude: ['lib/**/*.test.ts', 'lib/**/fixtures.ts', 'lib/**/*-fixtures.ts'],
      reporter: ['text', 'html'],
    },
  },
})
