import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getStudioSession } from '@/lib/studio-auth/session'
import { resolveWorkspaceContextFromRequest, getManufacturerVerificationData } from '@/lib/studio-manufacturer/workspace'
import { getManufacturerLinkLibrary } from '@/lib/studio-manufacturer/link-library'
import { listSystemDocuments } from '@/lib/studio-manufacturer/document-actions'
import { StudioShell } from '@/components/studio/StudioShell'
import { SetupFlowClient } from './SetupFlowClient'
import type { LinkedDocument } from './DocumentsStep'

// The guided setup flow (design doc addendum 3 §C5) — where a manufacturer
// lands right after adding a system on the Systems list. Distinct from
// /manufacturer/workspace/[systemId] (Verify systems): this page is about
// getting a system's photos, links and documents in and kicking off
// extraction; the Workspace is where the extracted facts get confirmed.

export const dynamic = 'force-dynamic'

export default async function SystemSetupPage({
  params,
}: {
  params: Promise<{ systemId: string }>
}) {
  const { systemId } = await params
  const session = await getStudioSession()
  const ctx = await resolveWorkspaceContextFromRequest(session)

  if (!ctx.found) {
    return (
      <StudioShell role="manufacturer" subtitle="System setup">
        <div className="studio-info">No manufacturer workspace assigned. Contact BuildQuote admin.</div>
      </StudioShell>
    )
  }

  const result = await getManufacturerVerificationData(ctx.manufacturerId)
  if (!result.ok) {
    return (
      <StudioShell role="manufacturer" subtitle="System setup">
        <div className="studio-warn">Could not load system: {result.error}</div>
      </StudioShell>
    )
  }

  const system = result.systems.find((s) => s.id === systemId)
  if (!system) notFound()

  const linkLibraryResult = await getManufacturerLinkLibrary(ctx.manufacturerId)
  const linkLibrary = linkLibraryResult.ok ? linkLibraryResult.links : []

  const documentsResult = await listSystemDocuments(ctx.manufacturerId, systemId)
  const initialDocuments: LinkedDocument[] = documentsResult.ok
    ? documentsResult.documents
        .filter((d) => d.role !== 'website')
        .map((d) => ({ documentId: d.documentId ?? d.systemSourceId, role: d.role, label: d.label, documentName: d.documentName }))
    : []

  return (
    <StudioShell role="manufacturer" subtitle={`${result.manufacturer.name} · System setup`}>
      <div style={{ marginBottom: '1.2rem' }}>
        <Link href="/manufacturer/systems" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--ds-text-muted, #6b7280)', textDecoration: 'none' }}>
          ← All systems
        </Link>
        <h1 style={{ fontSize: '1.15rem', margin: '0.4rem 0 0' }}>Set up {system.name}</h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--ds-text-muted)', margin: '0.4rem 0 0', lineHeight: 1.6, maxWidth: 640 }}>
          Work through these four steps to get {system.name} ready. Everything you add here is
          scoped to this one system — nothing gets mixed up with your other products.
        </p>
      </div>

      <div style={{ maxWidth: 640 }}>
        <SetupFlowClient
          systemId={system.id}
          systemName={system.name}
          manufacturerId={ctx.manufacturerId}
          initialGallery={system.gallery_images ?? []}
          initialCustomDocumentLinks={system.custom_document_links ?? []}
          linkLibrary={linkLibrary}
          initialDocuments={initialDocuments}
        />
      </div>
    </StudioShell>
  )
}
