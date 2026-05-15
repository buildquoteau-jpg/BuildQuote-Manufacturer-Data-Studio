import { StudioShell } from '@/components/studio/StudioShell'
import { SystemCard, type SystemCardData } from '@/components/system-card/SystemCard'
import { getAdminManufacturerSystemCards } from '@/lib/studio-admin/manufacturer-workspace'

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

  const cards: SystemCardData[] = systems.map((sys) => ({
    name: sys.name,
    manufacturer_name: m.name,
    category: sys.category,
    subcategory: sys.subcategory,
    description: sys.description,
    hero_image_url: sys.hero_image_url,
    bal_rating: sys.bal_rating,
    notes: sys.notes,
    profiles: sys.profiles,
    components: sys.components,
    colours: sys.colours,
  }))

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
          {cards.map((card, i) => (
            <SystemCard key={systems[i].id} data={card} />
          ))}
        </div>
      )}
    </StudioShell>
  )
}
