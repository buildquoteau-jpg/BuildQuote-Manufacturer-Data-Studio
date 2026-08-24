'use client'

// The System Workspace (design doc §7): one page per product. Left column —
// accordion sections (Identity is wired in this shell; Images/Variants/
// Colours/Components/Attributes/Applications/Documents/Relationships/
// Stockists arrive in task #6). Right column — pinned preview, two tabs:
// the real customer System Card, and a plain-English read of what the AI
// knows. Replaces Verify systems + Asset picker + Preview + Publish-card as
// separate tabs — everything for one product lives here.

import { useState } from 'react'
import Link from 'next/link'
import { SystemCardRenderer } from '@/components/system-card-renderer/SystemCardRenderer'
import type { SystemCardSystem } from '@/components/system-card-renderer/types'
import { FactRow } from './FactRow'
import { WorkspaceSection, type SectionStatus } from './WorkspaceSection'
import type { FactViewModel } from './factViewModel'

type PreviewTab = 'card' | 'ai'

export function SystemWorkspaceShell({
  systemId,
  systemName,
  manufacturerId,
  manufacturerSlug,
  verificationStatus,
  previewSystem,
  identityFacts,
  coverage,
}: {
  systemId: string
  systemName: string
  manufacturerId: string
  manufacturerSlug: string
  verificationStatus: string
  previewSystem: SystemCardSystem
  identityFacts: FactViewModel[]
  coverage: Record<string, string>
}) {
  const [tab, setTab] = useState<PreviewTab>('card')

  const needsCount = identityFacts.filter((f) =>
    f.epistemicStatus === 'unverified' || f.epistemicStatus === 'stale' || f.epistemicStatus === 'disputed',
  ).length

  const identityStatus: SectionStatus = needsCount > 0 ? 'warn' : identityFacts.length > 0 ? 'ok' : 'empty'

  const stages = ['Documents', 'Extracted', 'Review', 'Verified', 'Live']
  const stageIndex =
    verificationStatus === 'manufacturer_verified' ? 3 :
    verificationStatus === 'in_review' ? 2 :
    identityFacts.length > 0 ? 1 : 0

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
          <WorkspaceSection title="Identity & description" status={identityStatus}
            statusLabel={needsCount > 0 ? `${needsCount} need${needsCount === 1 ? 's' : ''} you` : 'confirmed'} defaultOpen>
            {identityFacts.map((f) => (
              <FactRow
                key={f.predicate}
                label={f.label}
                predicate={f.predicate}
                claimType={f.claimType}
                value={f.value}
                rawValue={f.rawValue}
                origin={f.origin}
                epistemicStatus={f.epistemicStatus}
                sourceLine={f.sourceLine}
                systemId={systemId}
                manufacturerId={manufacturerId}
              />
            ))}
            {identityFacts.length === 0 && (
              <div style={{ fontSize: '0.82rem', color: 'var(--ds-text-faint, #9ca3af)', fontStyle: 'italic', padding: '0.6rem 0' }}>
                No identity fields extracted yet.
              </div>
            )}
          </WorkspaceSection>

          <WorkspaceSection title="Images" statusLabel="edit in Asset picker for now">
            <p style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted, #6b7280)', margin: '0.4rem 0' }}>
              Hero image, gallery and colour swatches move into this section next —{' '}
              <Link href={`/manufacturer/cms/${systemId}`} style={{ color: '#185D7A', fontWeight: 600 }}>edit them in Asset picker</Link> for now.
            </p>
          </WorkspaceSection>

          <WorkspaceSection title="Variants, colours & components" statusLabel="edit in Verify systems for now">
            <p style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted, #6b7280)', margin: '0.4rem 0' }}>
              Profiles, colours and components move into this workspace next —{' '}
              <Link href="/manufacturer/review" style={{ color: '#185D7A', fontWeight: 600 }}>edit them in Verify systems</Link> for now.
            </p>
          </WorkspaceSection>

          <WorkspaceSection title="Applications & installation" statusLabel="not yet extracted">
            <p style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted, #6b7280)', margin: '0.4rem 0' }}>
              Installation methods, fixing requirements and applications require the knowledge parser, which hasn&apos;t run yet.
            </p>
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
              {identityFacts.map((f) => (
                <FactRow
                  key={f.predicate}
                  label={f.label}
                  predicate={f.predicate}
                  claimType={f.claimType}
                  value={f.value}
                  rawValue={f.rawValue}
                  origin={f.origin}
                  epistemicStatus={f.epistemicStatus}
                  sourceLine={f.sourceLine}
                  systemId={systemId}
                  manufacturerId={manufacturerId}
                  readOnly
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
