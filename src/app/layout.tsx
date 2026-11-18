import type { Metadata, Viewport } from 'next'
// The typeface is bundled with the app, so viewing the archive never calls out to Google
import '@fontsource-variable/bricolage-grotesque/opsz.css'
import './globals.css'

export const metadata: Metadata = {
  title: 'Memory Vault',
  description: 'Your family’s memories, kept privately.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f4f6fb',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en-ZA" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  )
}
