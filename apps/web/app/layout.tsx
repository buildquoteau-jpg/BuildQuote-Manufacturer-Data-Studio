import type { Metadata } from 'next'
import './globals.css'
import { DraftDisclaimerBanner, DraftWatermark } from '@/components/DraftDisclaimer'

export const metadata: Metadata = {
  title: 'BuildQuote Data Studio',
  description: 'Manufacturer data ingestion, verification and publishing.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <DraftDisclaimerBanner />
        <DraftWatermark />
        {children}
      </body>
    </html>
  )
}
