// Tokenised, no-login stockist confirmation — same pattern as the embed
// widget tokens (033). The manufacturer emails this link to a stockist:
//
//   /stockist-confirm/<confirm_token>
//
// One click on "Yes" sets confirm_status = 'confirmed' + confirmed_at; the
// stockist then shows a "Confirmed <date>" tag on the manufacturer's cards.
// Service client (public page, RLS bypass, token IS the credential).

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createStudioServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

type StockistTokenRow = {
  id: string
  business_name: string
  confirm_status: string
  confirmed_at: string | null
  manufacturer_id: string
}

async function lookupStockist(token: string): Promise<{
  stockist: StockistTokenRow | null
  manufacturerName: string | null
  error: string | null
}> {
  try {
    const supabase = createStudioServiceClient()
    const { data, error } = await supabase
      .from('manufacturer_stockists')
      .select('id, business_name, confirm_status, confirmed_at, manufacturer_id')
      .eq('confirm_token', token)
      .maybeSingle()
    if (error) return { stockist: null, manufacturerName: null, error: error.message }
    if (!data) return { stockist: null, manufacturerName: null, error: null }
    const { data: mfr } = await supabase
      .from('data_studio_manufacturers')
      .select('name')
      .eq('id', data.manufacturer_id)
      .single()
    return { stockist: data as StockistTokenRow, manufacturerName: mfr?.name ?? null, error: null }
  } catch (err) {
    return { stockist: null, manufacturerName: null, error: err instanceof Error ? err.message : 'Unexpected error' }
  }
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'linear-gradient(135deg, #0f3a4d 0%, #185D7A 60%, #1a7a9e 100%)',
  padding: '1.5rem',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Roboto, sans-serif",
}

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 460,
  background: '#fff',
  borderRadius: 16,
  boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
  padding: '2rem',
  textAlign: 'center',
}

export default async function StockistConfirmPage({
  params,
  searchParams,
}: {
  params: { token: string }
  searchParams: { done?: string; error?: string }
}) {
  const { stockist, manufacturerName, error } = await lookupStockist(params.token)

  async function confirmSupply() {
    'use server'
    const supabase = createStudioServiceClient()
    const { error: updateError } = await supabase
      .from('manufacturer_stockists')
      .update({
        confirm_status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('confirm_token', params.token)
      .eq('confirm_status', 'unconfirmed')
    // Without this the page just re-renders the same button, leaving the
    // stockist to click Yes again on a confirmation that never saved.
    if (updateError) {
      console.error(`[stockist-confirm] could not confirm token ${params.token}:`, updateError.message)
      redirect(`/stockist-confirm/${params.token}?error=save`)
    }
    revalidatePath(`/stockist-confirm/${params.token}`)
  }

  if (error || !stockist) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={{ fontSize: '1.2rem', color: '#185D7A', margin: '0 0 0.6rem' }}>Link not recognised</h1>
          <p style={{ fontSize: '0.9rem', color: '#64748b', margin: 0, lineHeight: 1.6 }}>
            This confirmation link is invalid or no longer active. Please contact the
            manufacturer who sent it to you for a fresh link.
          </p>
        </div>
      </div>
    )
  }

  const confirmed = stockist.confirm_status === 'confirmed'

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '0.75rem' }}>
          BuildQuote System Cards
        </div>
        {confirmed ? (
          <>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✅</div>
            <h1 style={{ fontSize: '1.2rem', color: '#166534', margin: '0 0 0.6rem' }}>
              Thanks — you&rsquo;re confirmed!
            </h1>
            <p style={{ fontSize: '0.9rem', color: '#475569', margin: 0, lineHeight: 1.6 }}>
              <strong>{stockist.business_name}</strong> is listed as a confirmed supplier
              {manufacturerName ? <> of <strong>{manufacturerName}</strong> products</> : null}
              {stockist.confirmed_at && (
                <> (confirmed {new Date(stockist.confirmed_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })})</>
              )}.
              No further action needed.
            </p>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: '1.2rem', color: '#185D7A', margin: '0 0 0.6rem' }}>
              Do you stock or can you supply
              {manufacturerName ? <> {manufacturerName} systems?</> : <> these systems?</>}
            </h1>
            <p style={{ fontSize: '0.9rem', color: '#64748b', margin: '0 0 1.4rem', lineHeight: 1.6 }}>
              {manufacturerName ?? 'A manufacturer'} lists{' '}
              <strong>{stockist.business_name}</strong> as a local stockist on their product
              System Cards. One click confirms it — no login or account needed.
            </p>
            {searchParams.error === 'save' && (
              <p style={{ fontSize: '0.85rem', color: '#b91c1c', margin: '0 0 1rem', lineHeight: 1.5 }}>
                Sorry — we could not record your confirmation just then. Please try again, or
                reply to the manufacturer&rsquo;s email if it keeps failing.
              </p>
            )}
            <form action={confirmSupply}>
              <button
                type="submit"
                style={{
                  width: '100%',
                  padding: '0.85rem 1rem',
                  borderRadius: 10,
                  border: 'none',
                  background: '#185D7A',
                  color: '#fff',
                  fontSize: '1rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Yes — we stock / can supply these systems
              </button>
            </form>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '1rem 0 0', lineHeight: 1.5 }}>
              Not you, or not right? Just close this page — nothing is recorded unless you
              click Yes.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
