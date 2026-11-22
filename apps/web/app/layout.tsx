import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'BuildQuote Data Studio',
  description: 'Manufacturer data ingestion, verification and publishing.',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  )
}
