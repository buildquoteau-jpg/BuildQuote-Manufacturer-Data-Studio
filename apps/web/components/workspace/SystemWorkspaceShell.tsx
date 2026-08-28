'use client'

// The System Workspace (design doc §7): one page per product. Left column —
// accordion sections. Right column — pinned preview, two tabs: the real
// customer System Card, and a plain-English read of what the AI knows.
// Replaces Verify systems + Asset picker + Preview + Publish-card as
// separate tabs — everything for one product lives here.

import { useState } from 'react'
import Link from 'next/link'
import { SystemCardRenderer } from '@/components/system-card-renderer/SystemCardRenderer'
import type { SystemCardSystem } from '@/components/system-card-renderer/types'
import type { SlotAsset } from '@/app/(protected)/manufacturer/profile/AssetSlotControl'
import type {
  VerificationSystemProfile,
  VerificationSystemColour,
  VerificationSystemComponent,
} from '@/lib/studio-manufacturer/workspace'
import { FactRow } from './FactRow'
import { WorkspaceSection, type SectionStatus } from './WorkspaceSection'
import { AttributesSection } from './AttributesSection'
import { VariantsSection } from './VariantsSection'
import { ColoursSection } from './ColoursSection'
import { ComponentsSection } from './ComponentsSection'
import { ImagesSection } from './ImagesSection'
import { RelationshipsSection } from './RelationshipsSection'
import { ApplicationsSection } from './ApplicationsSection'
import { EvidenceGroupBulkVerify } from './EvidenceGroupBulkVerify'
import { LinksSection } from './LinksSection'
import type { FactViewModel } from './factViewModel'
import type { CustomDocumentLink } from '@/lib/studio-manufacturer/verification-actions'
import type { LinkLibraryEntry } from '@/lib/studio-manufacturer/link-library'

type PreviewTab = 'card' | 'ai'
type GalleryImage = { asset_id?: string | null; url: string; og_jpg_url?: string | null; alt: string; caption?: string | null }

function needsCountFor(facts: FactViewModel[]): number {
  return facts.filter((f) =>
    f.epistemicStatus === 'unverified' || f.epistemicStatus === 'stale' || f.epistemicStatus === 'disputed',
  ).length
}

export function SystemWorkspaceShell({
  systemId,
  systemName,
  manufacturerId,
  manufacturerName,
  manufacturerSlug,
  verificationStatus,
  previewSystem,
  identityFacts,
  attributeFacts,
  allFacts,
  coverage,
  customAttributes,
  profiles,
  colours,
  components,
  pickerAssets,
  heroAssetId,
  heroUrl,
  galleryImages,
  ownSystems,
  sourceDocumentId,
  customDocumentLinks,
  linkLibrary,
}: {
  systemId: string
  systemName: string
  manufacturerId: string
  manufacturerName: string
  manufacturerSlug: string
  verificationStatus: string
  previewSystem: SystemCardSystem
  identityFacts: FactViewModel[]
  attributeFacts: FactViewModel[]
  allFacts: FactViewModel[]
  coverage: Record<string, string>
  customAttributes: { label: string; value: string }[]
  profiles: VerificationSystemProfile[]
  colours: VerificationSystemColour[]
  components: VerificationSystemComponent[]
  pickerAssets: SlotAsset[]
  heroAssetId: string | null
  heroUrl: string | null
  galleryImages: GalleryImage[]
  ownSystems: { id: string; name: string }[]
  sourceDocumentId: string | null
  customDocumentLinks: CustomDocumentLink[]
  linkLibrary: LinkLibraryEntry[]
}) {
  const [tab, setTab] = useState<PreviewTab>('card')
  const [customAttrs, setCustomAttrs] = useState(customAttributes)

  const identityNeeds = needsCountFor(identityFacts)
  const attributeNeeds = needsCountFor(attributeFacts)

  const identityStatus: SectionStatus = identityNeeds > 0 ? 'warn' : identityFacts.length > 0 ? 'ok' : 'empty'
  const attributeStatus: SectionStatus = attributeNeeds > 0 ? 'warn' : attributeFacts.length > 0 ? 'ok' : 'empty'
  const variantsStatus: SectionStatus = profiles.length > 0 ? 'ok' : 'empty'
  const coloursStatus: SectionStatus = colours.length > 0 ? 'ok' : 'empty'
  const componentsStatus: SectionStatus = components.length > 0 ? 'ok' : 'empty'
  const imagesStatus: SectionStatus = heroAssetId || heroUrl ? 'ok' : 'empty'

  const stages = ['Documents', 'Extracted', 'Review', 'Verified', 'Live']
  const stageIndex =
    verificationStatus === 'manufacturer_verified' ? 3 :
    verificationStatus === 'in_review' ? 2 :
    allFacts.length > 0 ? 1 : 0

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', marginBottom: '0.9rem', flexWrap: 'wrap' }}>
        <Link href="/manufacturer/review" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--ds-text-muted, #6b7280)', textDecoration: 'none' }}>
          ← All products
        </Link>
        <h1 style={{ fontSize: '1.15rem', margin: 0, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {systemName}
        </h1>
        <span style={{
          fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20,
          background: verificationStatus === 'manufacturer_verified' ? '#f0fdf4' : '#fffbeb',
          border: `1px solid ${verificationStatus === 'manufacturer_verified' ? '#bbf7d0' : '#fde68a'}`,
          color: verificationStatus === 'manufacturer_verified' ? '#16a34a' : '#d97706',
        }}>
          {verificationStatus === 'manufacturer_verified' ? 'Verified' : verificationStatus === 'in_review' ? 'In review' : 'Draft'}
        </span>
      </div>

      {/* Progress rail */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1.3rem', fontSize: '0.74rem', color: 'var(--ds-text-muted, #6b7280)' }}>
        {stages.map((s, i) => (
          <span key={s} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: i <= stageIndex ? '#185D7A' : '#e5e7eb',
            }} />
            <span style={{ fontWeight: i === stageIndex ? 700 : 400, color: i === stageIndex ? 'var(--ds-text, #0f172a)' : undefined }}>{s}</span>
            {i < stages.length - 1 && <span style={{ color: '#d1d5db' }}>—</span>}
          </span>
        ))}
      </div>

      {/* Two columns: sections / preview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(360px, 480px)', gap: '1.5rem', alignItems: 'start' }}>

        {/* Left — accordion sections */}
        <div>
          <EvidenceGroupBulkVerify facts={allFacts} systemId={systemId} manufacturerId={manufacturerId} />

          <WorkspaceSection title="Identity & description" status={identityStatus}
            statusLabel={identityNeeds > 0 ? `${identityNeeds} need${identityNeeds === 1 ? 's' : ''} you` : 'confirmed'} defaultOpen>
            {identityFacts.map((f) => (
              <FactRow
                key={f.predicate}
                label={f.label} predicate={f.predicate} claimType={f.claimType}
                value={f.value} rawValue={f.rawValue} origin={f.origin} epistemicStatus={f.epistemicStatus}
                sourceLine={f.sourceLine} systemId={systemId} manufacturerId={manufacturerId}
              />
            ))}
            {identityFacts.length === 0 && (
              <div style={{ fontSize: '0.82rem', color: 'var(--ds-text-faint, #9ca3af)', fontStyle: 'italic', padding: '0.6rem 0' }}>
                No identity fields extracted yet.
              </div>
            )}
          </WorkspaceSection>

          <WorkspaceSection title="Images" status={imagesStatus} statusLabel={imagesStatus === 'ok' ? 'hero set' : 'no hero image'}>
            <ImagesSection
              systemId={systemId} manufacturerId={manufacturerId}
              heroAssetId={heroAssetId} heroUrl={heroUrl}
              initialGallery={galleryImages} pickerAssets={pickerAssets}
            />
          </WorkspaceSection>

          <WorkspaceSection title="Links & resources" statusLabel={`${customDocumentLinks.length} link${customDocumentLinks.length === 1 ? '' : 's'}`}>
            <LinksSection
              systemId={systemId} manufacturerId={manufacturerId}
              initialLinks={customDocumentLinks} linkLibrary={linkLibrary}
            />
          </WorkspaceSection>

          <WorkspaceSection title="Variants & sizes" status={variantsStatus} statusLabel={`${profiles.length} variant${profiles.length === 1 ? '' : 's'}`}>
            <VariantsSection systemId={systemId} manufacturerId={manufacturerId} initialProfiles={profiles} />
          </WorkspaceSection>

          <WorkspaceSection title="Colours & finishes" status={coloursStatus} statusLabel={`${colours.length} colour${colours.length === 1 ? '' : 's'}`}>
            <ColoursSection systemId={systemId} manufacturerId={manufacturerId} initialColours={colours} pickerAssets={pickerAssets} />
          </WorkspaceSection>

          <WorkspaceSection title="Components & accessories" status={componentsStatus} statusLabel={`${components.length} item${components.length === 1 ? '' : 's'}`}>
            <ComponentsSection systemId={systemId} manufacturerId={manufacturerId} initialComponents={components} />
          </WorkspaceSection>

          <WorkspaceSection title="Attributes & performance" status={attributeStatus}
            statusLabel={attributeNeeds > 0 ? `${attributeNeeds} need${attributeNeeds === 1 ? 's' : ''} you` : 'confirmed'}>
            <AttributesSection
              systemId={systemId} manufacturerId={manufacturerId}
              attributeFacts={attributeFacts} customAttributes={customAttrs}
              onCustomAttributesChanged={setCustomAttrs}
            />
          </WorkspaceSection>

          <WorkspaceSection title="Relationships" statusLabel="works with / do not use with / replaces">
            <RelationshipsSection systemId={systemId} manufacturerId={manufacturerId} ownSystems={ownSystems} />
          </WorkspaceSection>

          <WorkspaceSection title="Applications & installation" statusLabel={sourceDocumentId ? 'not yet extracted' : 'no source document linked'}>
            <ApplicationsSection
              manufacturerId={manufacturerId}
              manufacturerName={manufacturerName}
              stagedSystemId={systemId}
              sourceDocumentId={sourceDocumentId}
            />
          </WorkspaceSection>
        </div>

        {/* Right — pinned preview, two tabs */}
        <div style={{ position: 'sticky', top: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.7rem', background: '#f1f5f9', padding: '3px', borderRadius: 8, width: 'fit-content' }}>
            <TabButton label="Customer card" active={tab === 'card'} onClick={() => setTab('card')} />
            <TabButton label="What the AI knows" active={tab === 'ai'} onClick={() => setTab('ai')} />
          </div>

          {tab === 'card' ? (
            <div style={{ border: '1px solid var(--ds-border, #e5e7eb)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
              <SystemCardRenderer system={previewSystem} />
            </div>
          ) : (
            <div style={{ border: '1px solid var(--ds-border, #e5e7eb)', borderRadius: 10, background: '#fff', padding: '0.9rem 1rem' }}>
              <p style={{ fontSize: '0.78rem', color: 'var(--ds-text-muted, #6b7280)', margin: '0 0 0.6rem' }}>
                A plain-English read of the machine-readable object at{' '}
                <code style={{ fontSize: '0.74rem' }}>/api/cards/{previewSystem.slug}/knowledge.jsonld?m={manufacturerSlug}</code>.
              </p>
              {allFacts.map((f) => (
                <FactRow
                  key={f.predicate}
                  label={f.label} predicate={f.predicate} claimType={f.claimType}
                  value={f.value} rawValue={f.rawValue} origin={f.origin} epistemicStatus={f.epistemicStatus}
                  sourceLine={f.sourceLine} systemId={systemId} manufacturerId={manufacturerId} readOnly
                />
              ))}
              <div style={{ marginTop: '1rem', paddingTop: '0.8rem', borderTop: '1px solid var(--ds-border, #e5e7eb)' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ds-text-faint, #9ca3af)', marginBottom: '0.4rem' }}>
                  Not yet covered
                </div>
                {Object.entries(coverage).map(([key, note]) => (
                  <div key={key} style={{ fontSize: '0.76rem', color: 'var(--ds-text-faint, #9ca3af)', marginBottom: '0.2rem' }}>
                    {key}: {note}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '0.4rem 0.8rem', borderRadius: 6, border: 'none', cursor: 'pointer',
        fontSize: '0.8rem', fontWeight: 700,
        background: active ? '#fff' : 'transparent',
        color: active ? 'var(--ds-text, #0f172a)' : 'var(--ds-text-muted, #6b7280)',
        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
      }}
    >
      {label}
    </button>
  )
}
