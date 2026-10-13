import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Nafran Leads',
  description: 'Find local businesses by keyword and place, and export them as a lead list.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
