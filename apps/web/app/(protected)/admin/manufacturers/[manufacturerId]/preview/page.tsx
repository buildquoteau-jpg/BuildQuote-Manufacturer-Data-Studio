import { StudioShell } from '@/components/studio/StudioShell'
import { SystemCard, type SystemCardData } from '@/components/system-card/SystemCard'
import { AdminVerificationBar } from '@/components/admin/AdminVerificationBar'
import { getAdminManufacturerSystemCards } from '@/lib/studio-admin/manufacturer-workspace'
import type { VerificationStatus } from '@/lib/studio-admin/system-verification-actions'

type Props = {
  params: { manufacturerId: string }
}

export default async function AdminManufacturerPreviewPage({ params }: Props) {
  const { manufacturerId } = params
  const result = await getAdminManufacturerSystemCards(manufacturerId)

  if (!result.ok) {
    return (
      <StudioShell role="admin" subtitle="System card preview">
        <div style={{ marginBottom: '1.25rem' }}>
          <a href={`/admin/manufacturers/${manufacturerId}`} style={{ fontSize: '0.85rem', color: 'var(--ds-text-muted)' }}>
            ← Manufacturer detail
          </a>
        </div>
        <div className="studio-warn">{result.error}</div>
      </StudioShell>
    )
  }

  const { manufacturer: m, systems } = result

  return (
    <StudioShell role="admin" subtitle={`${m.name} · System card preview`}>
      <div style={{ marginBottom: '1.25rem' }}>
        <a href={`/admin/manufacturers/${manufacturerId}`} style={{ fontSize: '0.85rem', color: 'var(--ds-text-muted)' }}>
          ← {m.name}
        </a>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.25rem' }}>System card preview</h1>
        <span className="studio-badge studio-badge-draft">Admin preview</span>
      </div>

      <div className="studio-info" style={{ marginBottom: '1.25rem' }}>
        Private admin preview — {systems.length} system{systems.length !== 1 ? 's' : ''} loaded from staged data. Nothing shown here is published.
      </div>

      {systems.length === 0 ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--ds-text-muted)' }}>
          No staged systems found for this manufacturer.
        </p>
      ) : (
        <div className="sc-card-grid">
          {systems.map((sys) => {
            const card: SystemCardData = {
              name: sys.name,
              manufacturer_name: m.name,
              category: sys.category,
              subcategory: sys.subcategory,
              description: sys.description,
              hero_image_url: sys.hero_image_url,
              bal_rating: sys.bal_rating,
              fire_rating: sys.fire_rating,
              moisture_resistant: sys.moisture_resistant,
              acoustic_rating: sys.acoustic_rating,
              structural_grade: sys.structural_grade,
              australian_made: sys.australian_made,
              notes: sys.notes,
              source_url: null,
              profiles: sys.profiles,
              components: sys.components,
              colours: sys.colours,
            }
            const validStatuses: VerificationStatus[] = [
              'pending_review', 'in_review', 'manufacturer_verified',
            ]
            const safeStatus: VerificationStatus = validStatuses.includes(
              sys.verification_status as VerificationStatus,
            )
              ? (sys.verification_status as VerificationStatus)
              : 'pending_review'

            return (
              <div key={sys.id} style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ flex: 1 }}>
                  <SystemCard data={card} />
                </div>
                <AdminVerificationBar
                  systemId={sys.id}
                  initialStatus={safeStatus}
                  initialNotes={sys.reviewer_notes}
                  initialBalRating={sys.bal_rating}
                  initialFireRating={sys.fire_rating}
                  initialAcousticRating={sys.acoustic_rating}
                  initialMoistureResistant={sys.moisture_resistant ?? false}
                  initialStructuralGrade={sys.structural_grade}
                  initialAustralianMade={sys.australian_made ?? false}
                />
              </div>
            )
          })}
        </div>
      )}
    </StudioShell>
  )
}
