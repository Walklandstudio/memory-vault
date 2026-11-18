import Link from 'next/link'
import { Importer } from './importer'

export default function ImportPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <Link href="/" className="text-sm underline opacity-70 hover:opacity-100">
        ← Back to your archive
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Import memories</h1>
      <p className="mt-2 text-sm opacity-70">
        Choose a WhatsApp chat export from your iPhone, or an Instagram “Download your
        information” export in JSON format. The zip is read on this computer, and only what
        belongs in your archive is sent to it.
      </p>
      <Importer />
    </main>
  )
}
