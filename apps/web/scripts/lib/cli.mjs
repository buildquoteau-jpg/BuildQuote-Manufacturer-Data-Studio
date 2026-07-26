// Shared CLI plumbing for the scripts in apps/web/scripts.
//
// Written as .mjs (with JSDoc types) so the tsx-run .ts scripts and the
// node-run .mjs scripts can share one implementation instead of each carrying
// its own copy.

import { existsSync, readFileSync } from 'fs'

/**
 * Loads a dotenv-style file into process.env. Existing variables always win,
 * so an explicitly exported env var overrides .env.local. Values may carry a
 * trailing ` # comment` and surrounding quotes; both are stripped.
 *
 * @param {string} filepath
 * @returns {void}
 */
export function loadEnvFile(filepath) {
  if (!existsSync(filepath)) return
  const lines = readFileSync(filepath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 0) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const rawVal = trimmed.slice(eqIdx + 1).split(' #')[0].trim()
    const val = rawVal.replace(/^["']|["']$/g, '')
    if (key && !(key in process.env)) {
      process.env[key] = val
    }
  }
}

/**
 * Minimal `--flag value` / `--flag` argv parser.
 *
 * @param {string[]} argv
 * @returns {Record<string, string | boolean>}
 */
export function parseArgs(argv) {
  /** @type {Record<string, string | boolean>} */
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('--')) {
        args[key] = next
        i++
      } else {
        args[key] = true
      }
    }
  }
  return args
}
