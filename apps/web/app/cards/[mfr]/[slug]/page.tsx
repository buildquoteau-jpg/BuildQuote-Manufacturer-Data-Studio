// Canonical hosted card URL — ALWAYS the current version.
//
//   /cards/<manufacturer-slug>/<card-slug>
//
// This URL is permanent: it survives edits, renames (the slug is stable in
// staged_systems.slug) and version bumps. Old versions live at
// /cards/<mfr>/<slug>/v/<n> with a superseded banner.

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getHostedCard } from '@/lib/data/getHostedCard'
import { HostedCardPage } from '@/components/system-card-renderer/HostedCardPage'
import { buildCardJsonLd } from '@/lib/packages/jsonld'

export const dynamic = 'force-dynamic'

const ORIGIN = process.env.NEXT_PUBLIC_APP_URL || 'https://studio.buildquote.com.au'

export async function generateMetadata({ params }: { params: { mfr: string; slug: string } }): Promise<Metadata> {
  const card = await getHostedCard(params.mfr, params.slug)
  if (!card) return { title: 'System Card not found' }
  return {
    title: `${card.system.name} — ${card.manufacturerName} System Card`,
    description: card.system.description ?? undefined,
    alternates: { canonical: `${ORIGIN}/cards/${params.mfr}/${params.slug}` },
  }
}

export default async function HostedCardCanonicalPage({ params }: { params: { mfr: string; slug: string } }) {
  const card = await getHostedCard(params.mfr, params.slug)
  if (!card) notFound()

  const canonicalUrl = `${ORIGIN}/cards/${card.manufacturerSlug}/${card.cardSlug}`
  const jsonLd = buildCardJsonLd(card.system, canonicalUrl)

  return (
    <>
    <script
      type="application/ld+json"
      // JSON.stringify + < escaping — same guard as the package generator
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
    />
    <HostedCardPage
      system={card.system}
      stockists={card.stockists}
      validation={card.validation}
      manufacturerName={card.manufacturerName}
      canonicalUrl={canonicalUrl}
      superseded={false}
      version={card.version}
      storageKey={`bq-shopping-list:${card.manufacturerSlug}`}
    />
    </>
  )
}
