'use client'

// The System Workspace (design doc §7): one page per product. Left column —
// accordion sections. Right column — pinned preview, two tabs: the real
// customer System Card, and a plain-English read of what the AI knows.
// Replaces Verify systems + Asset picker + Preview + Publish-card as
// separate tabs — everything for one product lives here.

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { SystemCardV2Experience } from '@/components/system-card-v2/SystemCardV2Experience'
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
import { UnknownsSummary } from './UnknownsSummary'
import { LinksSection } from './LinksSection'
import type { FactViewModel } from './factViewModel'
import { markSystemVerified, type CustomDocumentLink } from '@/lib/studio-manufacturer/verification-actions'
import { publishCardLive } from '@/lib/studio-manufacturer/publish-live-actions'
import type { LinkLibraryEntry } from '@/lib/studio-manufacturer/link-library'

type PreviewTab = 'card' | 'ai' | 'jsonld'
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
  applicationFacts,
  allFacts,
  coverage,
  knowledgeJsonLd = null,
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
  applicationFacts: FactViewModel[]
  allFacts: FactViewModel[]
  coverage: Record<string, string>
  knowledgeJsonLd?: Record<string, unknown> | null
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
  const router = useRouter()
  const [tab, setTab] = useState<PreviewTab>('card')
  const [customAttrs, setCustomAttrs] = useState(customAttributes)
  const [jsonCopied, setJsonCopied] = useState(false)
  const [status, setStatus] = useState(verificationStatus)
  const [initials, setInitials] = useState('')
  const [actionPending, startActionTransition] = useTransition()
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [liveUrl, setLiveUrl] = useState<string | null>(null)
  const [actionErr, setActionErr] = useState<string | null>(null)

  const isVerified = status === 'manufacturer_verified'

  function handleMarkVerified(andPublish = false) {
    setActionErr(null)
    setActionMsg(null)
    const sig = initials.trim().toUpperCase() || 'VERIFIED'
    startActionTransition(async () => {
      if (!isVerified) {
        const res = await markSystemVerified(systemId, manufacturerId, sig)
        if (!res.ok) {
          setActionErr(res.error ?? 'Could not mark system verified.')
          return
        }
        setStatus('manufacturer_verified')
        if (!andPublish) {
          setActionMsg('Marked as verified — this system is now ready on the Publish tab.')
          router.refresh()
          return
        }
      }
      if (andPublish) {
        const pub = await publishCardLive(systemId)
        if (!pub.ok) {
          setActionErr(pub.error ?? 'Publish failed.')
          return
        }
        setLiveUrl(pub.liveUrl)
        setActionMsg(`Published v${pub.version} live!${pub.warnings.length ? ` (${pub.warnings[0]})` : ''}`)
        router.refresh()
      }
    })
  }

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
    liveUrl ? 4 :
    isVerified ? 3 :
    status === 'in_review' ? 2 :
    allFacts.length > 0 ? 1 : 0

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <Link href="/manufacturer/review" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--ds-text-muted, #6b7280)', textDecoration: 'none' }}>
          ← All systems
        </Link>
        <h1 style={{ fontSize: '1.15rem', margin: 0, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {systemName}
        </h1>
        <span style={{
          fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20,
          background: isVerified ? '#f0fdf4' : '#fffbeb',
          border: `1px solid ${isVerified ? '#bbf7d0' : '#fde68a'}`,
          color: isVerified ? '#16a34a' : '#d97706',
        }}>
          {isVerified ? '✓ Verified' : status === 'in_review' ? 'In review' : 'Draft'}
        </span>
        <Link href={`/manufacturer/systems/${systemId}/setup`} style={{
          fontSize: '0.78rem', fontWeight: 600, color: 'var(--ds-text-muted, #6b7280)',
          border: '1px solid var(--ds-border, #d1d5db)', borderRadius: 7, padding: '4px 10px', textDecoration: 'none',
        }}>
          Setup &amp; PDFs
        </Link>
        {!isVerified ? (
          <>
            <input
              type="text"
              maxLength={6}
              value={initials}
              onChange={(e) => setInitials(e.target.value)}
              placeholder="Initials"
              title="Your initials for the verification sign-off"
              style={{
                width: 68, padding: '4px 8px', fontSize: '0.76rem', fontWeight: 700,
                textTransform: 'uppercase', border: '1px solid var(--ds-border, #d1d5db)',
                borderRadius: 7, background: '#fff',
              }}
            />
            <button
              type="button"
              disabled={actionPending}
              onClick={() => handleMarkVerified(false)}
              style={{
                fontSize: '0.78rem', fontWeight: 700, color: '#166534', background: '#f0fdf4',
                border: '1px solid #86efac', borderRadius: 7, padding: '5px 11px',
                cursor: actionPending ? 'default' : 'pointer',
              }}
            >
              {actionPending ? 'Saving…' : '✓ Mark verified'}
            </button>
            <button
              type="button"
              disabled={actionPending}
              onClick={() => handleMarkVerified(true)}
              style={{
                fontSize: '0.78rem', fontWeight: 700, color: '#fff', background: '#16a34a',
                border: 'none', borderRadius: 7, padding: '5px 12px',
                cursor: actionPending ? 'default' : 'pointer',
              }}
            >
              {actionPending ? 'Publishing…' : 'Verify & Publish live →'}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={actionPending}
              onClick={() => handleMarkVerified(true)}
              style={{
                fontSize: '0.78rem', fontWeight: 700, color: '#fff', background: '#16a34a',
                border: 'none', borderRadius: 7, padding: '5px 12px',
                cursor: actionPending ? 'default' : 'pointer',
              }}
            >
              {actionPending ? 'Publishing…' : 'Publish live →'}
            </button>
            <Link href="/manufacturer/publish" style={{
              fontSize: '0.76rem', fontWeight: 600, color: '#185D7A',
              border: '1px solid rgba(24,93,122,0.3)', borderRadius: 7, padding: '4px 10px', textDecoration: 'none',
            }}>
              Publish tab
            </Link>
          </>
        )}
      </div>

      {(actionMsg || actionErr) && (
        <div style={{
          marginBottom: '0.9rem', padding: '0.6rem 0.9rem', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600,
          background: actionErr ? '#fef2f2' : '#f0fdf4',
          border: `1px solid ${actionErr ? '#fecaca' : '#bbf7d0'}`,
          color: actionErr ? '#b91c1c' : '#166534',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap',
        }}>
          <span>{actionErr ?? actionMsg}</span>
          {liveUrl && (
            <a href={liveUrl} target="_blank" rel="noreferrer" style={{ color: '#166534', fontWeight: 700 }}>
              View live card ↗
            </a>
          )}
        </div>
      )}

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
          <UnknownsSummary facts={allFacts} />

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
            <VariantsSection
              systemId={systemId}
              manufacturerId={manufacturerId}
              initialProfiles={profiles}
              websiteUrl={previewSystem.website_url ?? customDocumentLinks[0]?.url ?? null}
            />
          </WorkspaceSection>

          <WorkspaceSection title="Colours & finishes" status={coloursStatus} statusLabel={`${colours.length} colour${colours.length === 1 ? '' : 's'}`}>
            <ColoursSection systemId={systemId} manufacturerId={manufacturerId} initialColours={colours} pickerAssets={pickerAssets} />
          </WorkspaceSection>

          <WorkspaceSection title="Components & accessories" status={componentsStatus} statusLabel={`${components.length} item${components.length === 1 ? '' : 's'}`}>
            <ComponentsSection
              systemId={systemId}
              manufacturerId={manufacturerId}
              initialComponents={components}
              websiteUrl={previewSystem.website_url ?? customDocumentLinks[0]?.url ?? null}
            />
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

          <WorkspaceSection
            title="Applications & installation"
            status={applicationFacts.length > 0 ? (needsCountFor(applicationFacts) > 0 ? 'warn' : 'ok') : 'empty'}
            statusLabel={
              applicationFacts.length > 0
                ? `${applicationFacts.length} fact${applicationFacts.length === 1 ? '' : 's'}`
                : sourceDocumentId ? 'not yet extracted' : 'no source document linked'
            }
          >
            <ApplicationsSection
              manufacturerId={manufacturerId}
              manufacturerName={manufacturerName}
              stagedSystemId={systemId}
              sourceDocumentId={sourceDocumentId}
              facts={applicationFacts}
            />
          </WorkspaceSection>
        </div>

        {/* Right — pinned preview, three tabs */}
        <div style={{ position: 'sticky', top: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.7rem', background: '#f1f5f9', padding: '3px', borderRadius: 8, width: 'fit-content' }}>
            <TabButton label="Customer card" active={tab === 'card'} onClick={() => setTab('card')} />
            <TabButton label={`What the AI knows (${allFacts.length})`} active={tab === 'ai'} onClick={() => setTab('ai')} />
            <TabButton label="JSON-LD" active={tab === 'jsonld'} onClick={() => setTab('jsonld')} />
          </div>

          {tab === 'card' ? (
            <div style={{ border: '1px solid var(--ds-border, #e5e7eb)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
              <SystemCardV2Experience manufacturer={{ name: manufacturerName }} system={previewSystem} showExperimentBanner={false} embedded />
            </div>
          ) : tab === 'ai' ? (
            <div style={{ border: '1px solid var(--ds-border, #e5e7eb)', borderRadius: 10, background: '#fff', padding: '0.9rem 1rem', maxHeight: '78vh', overflowY: 'auto' }}>
              <p style={{ fontSize: '0.78rem', color: 'var(--ds-text-muted, #6b7280)', margin: '0 0 0.6rem' }}>
                A plain-English read of the live machine-readable object at{' '}
                <a
                  href={`/api/cards/${previewSystem.slug}/knowledge.jsonld?m=${manufacturerSlug}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: '0.74rem', fontFamily: 'monospace' }}
                >
                  /api/cards/{previewSystem.slug}/knowledge.jsonld?m={manufacturerSlug}
                </a>.
              </p>
              {allFacts.length === 0 && (
                <div style={{ fontSize: '0.8rem', color: 'var(--ds-text-faint, #9ca3af)', fontStyle: 'italic', marginBottom: '0.6rem' }}>
                  No extracted facts yet — upload PDF guides on Setup and run extraction.
                </div>
              )}
              {allFacts.map((f, idx) => (
                <FactRow
                  key={`${f.predicate}-${idx}`}
                  label={f.label} predicate={f.predicate} claimType={f.claimType}
                  value={f.value} rawValue={f.rawValue} origin={f.origin} epistemicStatus={f.epistemicStatus}
                  sourceLine={f.sourceLine} systemId={systemId} manufacturerId={manufacturerId} readOnly
                />
              ))}
              {Object.keys(coverage).length > 0 && (
                <div style={{ marginTop: '1rem', paddingTop: '0.8rem', borderTop: '1px solid var(--ds-border, #e5e7eb)' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ds-text-faint, #9ca3af)', marginBottom: '0.4rem' }}>
                    Coverage status
                  </div>
                  {Object.entries(coverage).map(([key, note]) => (
                    <div key={key} style={{ fontSize: '0.76rem', color: 'var(--ds-text-faint, #9ca3af)', marginBottom: '0.2rem' }}>
                      {key}: {note}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ border: '1px solid var(--ds-border, #e5e7eb)', borderRadius: 10, background: '#fff', padding: '0.9rem 1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
                <a
                  href={`/api/cards/${previewSystem.slug}/knowledge.jsonld?m=${manufacturerSlug}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: '0.74rem', fontFamily: 'monospace', wordBreak: 'break-all' }}
                >
                  /api/cards/{previewSystem.slug}/knowledge.jsonld?m={manufacturerSlug} ↗
                </a>
                <button
                  type="button"
                  disabled={!knowledgeJsonLd}
                  onClick={() => {
                    if (!knowledgeJsonLd) return
                    navigator.clipboard?.writeText(JSON.stringify(knowledgeJsonLd, null, 2))
                    setJsonCopied(true)
                    setTimeout(() => setJsonCopied(false), 2000)
                  }}
                  style={{
                    fontSize: '0.74rem', fontWeight: 700, padding: '4px 10px', borderRadius: 6,
                    border: '1px solid var(--ds-border, #d1d5db)', background: '#f8fafc', cursor: 'pointer',
                  }}
                >
                  {jsonCopied ? 'Copied!' : 'Copy JSON-LD'}
                </button>
              </div>
              {knowledgeJsonLd ? (
                <pre style={{
                  margin: 0, padding: '0.75rem', borderRadius: 8, background: '#0f172a', color: '#e2e8f0',
                  fontSize: '0.7rem', lineHeight: 1.45, maxHeight: '70vh', overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {JSON.stringify(knowledgeJsonLd, null, 2)}
                </pre>
              ) : (
                <div style={{ fontSize: '0.8rem', color: 'var(--ds-text-faint, #9ca3af)', fontStyle: 'italic' }}>
                  JSON-LD object could not be generated yet for this system.
                </div>
              )}
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
