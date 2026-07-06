// Versioned hosted card URL — an immutable snapshot.
//
//   /cards/<manufacturer-slug>/<card-slug>/v/<version>
//
// Old versions remain viewable here forever; anything but the latest version
// renders a "Superseded — view current version" banner linking to the
// canonical URL. Robots are asked not to index old versions.

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getHostedCard } from '@/lib/data/getHostedCard'
import { HostedCardPage } from '@/components/system-card-renderer/HostedCardPage'

export const dynamic = 'force-dynamic'

const ORIGIN = process.env.NEXT_PUBLIC_APP_URL || 'https://studio.buildquote.com.au'

export async function generateMetadata({ params }: { params: { mfr: string; slug: string; version: string } }): Promise<Metadata> {
  const versionNum = Number.parseInt(params.version, 10)
  if (!Number.isFinite(versionNum)) return { title: 'System Card not found' }
  const card = await getHostedCard(params.mfr, params.slug, versionNum)
  if (!card) return { title: 'System Card not found' }
  const isCurrent = card.version === card.latestVersion
  return {
    title: `${card.system.name} (v${card.version}) — ${card.manufacturerName} System Card`,
    description: card.system.description ?? undefined,
    alternates: { canonical: `${ORIGIN}/cards/${params.mfr}/${params.slug}` },
    robots: isCurrent ? undefined : { index: false, follow: true },
  }
}

export default async function HostedCardVersionPage({ params }: { params: { mfr: string; slug: string; version: string } }) {
  const versionNum = Number.parseInt(params.version, 10)
  if (!Number.isFinite(versionNum) || versionNum < 1) notFound()

  const card = await getHostedCard(params.mfr, params.slug, versionNum)
  if (!card) notFound()

  const superseded = card.version < card.latestVersion

  return (
    <HostedCardPage
      system={card.system}
      stockists={card.stockists}
      validation={card.validation}
      manufacturerName={card.manufacturerName}
      canonicalUrl={`${ORIGIN}/cards/${card.manufacturerSlug}/${card.cardSlug}`}
      superseded={superseded}
      version={card.version}
      storageKey={`bq-shopping-list:${card.manufacturerSlug}`}
    />
  )
}
