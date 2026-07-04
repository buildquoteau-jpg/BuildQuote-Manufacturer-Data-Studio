// Static-package browser entry. esbuild bundles this (React included) into a
// classic IIFE script — see scripts/build-static-card-bundle.mjs. Every page
// in the generated website inlines its data as JSON:
//
//   <div id="root"></div>
//   <script id="__SYSTEM_CARD_DATA__" type="application/json">{...}</script>
//   <script src="../../assets/system-card.js"></script>
//
// Inline data (not fetch) so pages work over file:// straight out of the ZIP.

import { createRoot } from 'react-dom/client'
import { StaticCollectionPage, StaticCardPage, type StaticPageData } from './StaticPages'

function mount() {
  const dataEl = document.getElementById('__SYSTEM_CARD_DATA__')
  const rootEl = document.getElementById('root')
  if (!dataEl || !rootEl) {
    console.error('[system-card] missing #__SYSTEM_CARD_DATA__ or #root')
    return
  }

  let data: StaticPageData
  try {
    data = JSON.parse(dataEl.textContent ?? '')
  } catch (err) {
    console.error('[system-card] invalid inline JSON', err)
    return
  }

  createRoot(rootEl).render(
    data.mode === 'card'
      ? <StaticCardPage data={data} />
      : <StaticCollectionPage data={data} />,
  )
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount)
} else {
  mount()
}
