'use client'

export function DraftDisclaimerBanner() {
  return (
    <div
      style={{
        background: '#7c3a00',
        color: '#fff',
        padding: '0.5rem 1.25rem',
        fontSize: '0.75rem',
        fontWeight: 500,
        lineHeight: 1.5,
        textAlign: 'center',
        letterSpacing: '0.01em',
        zIndex: 9999,
        position: 'relative',
      }}
    >
      <strong>PRIVATE DRAFT — NOT FOR DISTRIBUTION.</strong>{' '}
      This site is an internal build prototype under active development. No brands, manufacturers, or
      products displayed here have authorised, endorsed, or affiliated with BuildQuote. All product
      names, images, and information are used solely for system-development and testing purposes.
      This site is not for commercial use and is not publicly accessible.{' '}
      <strong>If you have reached this page without authorisation, please exit immediately.</strong>
    </div>
  )
}

export function DraftWatermark() {
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99998,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <span
        style={{
          fontSize: 'clamp(5rem, 14vw, 11rem)',
          fontWeight: 900,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'rgba(120, 80, 30, 0.045)',
          transform: 'rotate(-35deg)',
          whiteSpace: 'nowrap',
          userSelect: 'none',
          fontFamily: 'Georgia, serif',
          border: '0.18em solid rgba(120, 80, 30, 0.05)',
          padding: '0.1em 0.35em',
          borderRadius: '0.12em',
          filter: 'sepia(1)',
        }}
      >
        DRAFT
      </span>
    </div>
  )
}
