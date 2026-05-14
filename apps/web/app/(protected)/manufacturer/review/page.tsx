import { StudioShell } from '@/components/studio/StudioShell'

type ReviewSection = {
  id: string
  icon: string
  title: string
  count: string
  items: string[]
}

const SECTIONS: ReviewSection[] = [
  {
    id: 'systems',
    icon: '🏗',
    title: 'Systems',
    count: '4 staged',
    items: ['AlumaSeries 50 · pending review', 'AlumaSeries 65TH · pending review', 'SlidePro 80 · pending review', 'FoldMaster 120 · pending review'],
  },
  {
    id: 'profiles',
    icon: '📐',
    title: 'Profiles / Variants',
    count: '9 staged',
    items: ['AlumaSeries 50 — 50 Series · pending', 'AlumaSeries 50 — 65 Series · pending', 'SlidePro 80 — Standard · pending'],
  },
  {
    id: 'components',
    icon: '🔩',
    title: 'Components / Accessories',
    count: '12 staged',
    items: ['Aluminium frame extrusion 50mm · pending', 'Weatherseal gasket roll · pending', 'Stainless corner bracket · pending'],
  },
  {
    id: 'colours',
    icon: '🎨',
    title: 'Colours / Finishes',
    count: '6 staged',
    items: ['Anodised Silver · pending', 'Monument (Powder Coat) · pending', 'Surfmist (Powder Coat) · pending'],
  },
  {
    id: 'evidence',
    icon: '📋',
    title: 'Parser Notes / Evidence',
    count: '—',
    items: ['Source field evidence will show extraction confidence scores and source page references once connected.'],
  },
]

export default function ManufacturerReviewPage() {
  return (
    <StudioShell role="manufacturer" subtitle="Review staged data">
      <h1 style={{ fontSize: '1.25rem', marginBottom: '0.35rem' }}>Review Staged Data</h1>
      <p style={{ color: 'var(--ds-text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        Verify that extracted data accurately reflects your source documents. Once you mark data as
        ready, BuildQuote will review and approve before anything is published.
        <br />
        <span style={{ fontStyle: 'italic' }}>
          Review workflow not connected yet — placeholder data only. No verification actions are active.
        </span>
      </p>

      {SECTIONS.map((section) => (
        <div key={section.id} className="studio-section" style={{ marginTop: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem', paddingBottom: '0.4rem', borderBottom: '1px solid var(--ds-border-soft)' }}>
            <span style={{ fontSize: '1rem' }}>{section.icon}</span>
            <span className="studio-section-heading" style={{ margin: 0, border: 'none', padding: 0 }}>
              {section.title}
            </span>
            <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--ds-text-faint)' }}>
              {section.count}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {section.items.map((item) => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--ds-card-bg)', border: '1px solid var(--ds-border-soft)', borderRadius: 6, padding: '0.6rem 0.9rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--ds-text)' }}>{item}</span>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button disabled className="studio-btn studio-btn-ghost" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}>
                    Approve
                  </button>
                  <button disabled className="studio-btn studio-btn-ghost" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}>
                    Flag
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="studio-section">
        <div style={{ background: 'var(--ds-card-bg)', border: '1px solid var(--ds-border-soft)', borderRadius: 8, padding: '1rem 1.25rem', fontSize: '0.85rem', color: 'var(--ds-text-muted)' }}>
          Once all items are verified, you will be able to mark this workspace as ready for BuildQuote review.
          Production publish remains BuildQuote-admin gated.
        </div>
      </div>
    </StudioShell>
  )
}
