import { StudioShell } from '@/components/studio/StudioShell'
import { getPendingPublishBatches } from '@/lib/studio-admin/publish-actions'
import { PublishQueueClient } from './PublishQueueClient'

export const dynamic = 'force-dynamic'

export default async function AdminPublishPage() {
  const result = await getPendingPublishBatches()

  return (
    <StudioShell role="admin" subtitle="Publish queue">
      <h1 style={{ fontSize: '1.25rem', marginBottom: '0.4rem' }}>Publish queue</h1>
      <p style={{ fontSize: '0.85rem', color: 'var(--ds-text-muted)', marginBottom: '1.25rem' }}>
        Verified systems manufacturers have submitted for publication. Preview a batch to see exactly
        what would be created or updated in the live RFQ/MFP catalogue before publishing for real.
      </p>

      {!result.ok ? (
        <div className="studio-warn">Could not load publish queue: {result.error}</div>
      ) : (
        <PublishQueueClient initialBatches={result.batches} />
      )}
    </StudioShell>
  )
}
