import { defineConfig } from 'vitest/config'

// Unit-test config for the web app.
//
// Scope: pure, dependency-free modules (no DOM, no Supabase client, no network).
// The access-rule functions in lib/studio/access.ts and the parser validator in
// lib/parser/validate.ts are the primary targets — they encode the rules that
// decide who can see/do what, so they must stay covered.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
    // Keep CI output deterministic and fast.
    passWithNoTests: false,
  },
})
