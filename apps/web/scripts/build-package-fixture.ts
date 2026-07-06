// Builds a sample System Card website package ZIP from the static
// /system-card-preview seed data — no Supabase, no R2, no env needed.
// Use it to verify the generated static pages in a real browser:
//
//   corepack pnpm package:fixture
//
// Output: apps/web/.package-fixture/
//   james-hardie-system-cards.zip   the package as manufacturers download it
//   unzipped/system-cards/…         extracted copy — open index.html directly
//
// (package:fixture rebuilds the renderer bundle first, so this always
// reflects the current components/system-card-renderer code.)

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { buildPackageZip } from '../lib/packages/generator'
import { SYSTEM_CARD_BUNDLE_JS } from '../lib/packages/generated/system-card-bundle'
import { DEMO_MANUFACTURER, DEMO_SYSTEMS } from '../data/system-card-preview-seed'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, '..', '.package-fixture')

async function main() {
  const result = await buildPackageZip({
    manufacturer: {
      ...DEMO_MANUFACTURER,
      description:
        'Fixture package built from the /system-card-preview seed data. ' +
        'Everything on these pages runs locally — open index.html straight from disk.',
      website_url: 'https://www.jameshardie.com.au',
    },
    cards: DEMO_SYSTEMS.map((system) => ({
      slug: system.slug,
      system,
      heroAsset: null, // seed data has no hero images — tiles use the gradient fallback
      // Fixture stockists — exercise the "Local stockists" section, state
      // grouping (WA first) and the confirmed tag on the static pages.
      stockists: [
        {
          id: 'fx-1', name: 'Midland Building Supplies', suburb: 'Midland', state: 'WA',
          region: null, phone: '(08) 9250 1234', website_url: 'https://example.com.au',
          google_maps_url: null, opening_hours: null, delivery_info: null,
          service_postcodes: [], trade_desk_email: 'trade@example.com.au',
          confirmed_at: '2026-07-01T00:00:00Z',
        },
        {
          id: 'fx-2', name: 'Southern Timber & Hardware', suburb: 'Bunbury', state: 'WA',
          region: null, phone: '(08) 9721 5678', website_url: null,
          google_maps_url: null, opening_hours: null, delivery_info: null,
          service_postcodes: [], trade_desk_email: null, confirmed_at: null,
        },
        {
          id: 'fx-3', name: 'Eastside Trade Centre', suburb: 'Penrith', state: 'NSW',
          region: null, phone: '(02) 4700 9012', website_url: null,
          google_maps_url: null, opening_hours: null, delivery_info: null,
          service_postcodes: [], trade_desk_email: null, confirmed_at: null,
        },
      ],
      // Deliberately unreachable in the fixture — proves the silent fallback
      // to the embedded list.
      stockistsUrl: `https://studio.buildquote.com.au/api/cards/${system.slug}/stockists.json?m=james-hardie`,
      // Footer "Validated by … · date · v1"
      validation: {
        validated_by: 'James Hardie®',
        validated_at: '2026-06-17T00:00:00Z',
        version: 1,
      },
    })),
    logoAsset: null,
    brandHeroAsset: null,
    bundleJs: SYSTEM_CARD_BUNDLE_JS,
    websiteBaseUrl: 'https://www.jameshardie.com.au',
    installPath: '/system-cards/',
    packageVersion: 1,
    generatedAtIso: new Date().toISOString(),
  })

  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })

  const zipPath = join(outDir, 'james-hardie-system-cards.zip')
  writeFileSync(zipPath, result.zip)

  // Extract for direct browser inspection
  const unzipDir = join(outDir, 'unzipped')
  const zip = await JSZip.loadAsync(result.zip)
  for (const [relPath, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue
    const target = join(unzipDir, relPath)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, await entry.async('nodebuffer'))
  }

  console.log('Build log:')
  for (const line of result.buildLog) console.log(`  ${line}`)
  console.log('')
  console.log(`ZIP:      ${zipPath}`)
  console.log(`Checksum: ${result.checksum}`)
  console.log(`Open:     ${join(unzipDir, 'system-cards', 'index.html')}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
