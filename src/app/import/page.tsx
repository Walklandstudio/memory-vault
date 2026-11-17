import Link from 'next/link'
import { Importer } from './importer'

export default function ImportPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <Link href="/" className="text-sm underline opacity-70 hover:opacity-100">
        ← Back to your archive
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Import a WhatsApp chat</h1>
      <p className="mt-2 text-sm opacity-70">
        Choose a chat export zip from your iPhone. The zip is read on this computer. Only the
        messages are sent to your private archive in this step. Photos and videos come next.
      </p>
      <Importer />
    </main>
  )
}
