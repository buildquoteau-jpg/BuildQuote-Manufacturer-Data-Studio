import { StudioShell } from '@/components/studio/StudioShell'
import { getPendingPublishBatches, getPublishedManufacturers } from '@/lib/studio-admin/publish-actions'
import { PublishQueueClient } from './PublishQueueClient'
import { OrphanReportPanel } from './OrphanReportPanel'

export const dynamic = 'force-dynamic'

export default async function AdminPublishPage() {
  const [result, publishedResult] = await Promise.all([
    getPendingPublishBatches(),
    getPublishedManufacturers(),
  ])

  return (
    <StudioShell role="admin" subtitle="Publish queue">
      <h1 style={{ fontSize: '1.25rem', marginBottom: '0.4rem' }}>Approval queue</h1>
      <p style={{ fontSize: '0.85rem', color: 'var(--ds-text-muted)', marginBottom: '1.25rem' }}>
        Verified System Cards waiting for BuildQuote review and approval. Approving a batch promotes
        the cards into the approved source data, ready for package generation (and the optional
        BuildQuote-hosted embed). Preview a batch to see exactly what would be created or updated
        before approving for real.
      </p>

      {!result.ok ? (
        <div className="studio-warn">Could not load publish queue: {result.error}</div>
      ) : (
        <PublishQueueClient initialBatches={result.batches} />
      )}

      {publishedResult.ok && <OrphanReportPanel manufacturers={publishedResult.manufacturers} />}
    </StudioShell>
  )
}
