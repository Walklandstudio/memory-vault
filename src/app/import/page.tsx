import Link from 'next/link'
import { Importer } from './importer'

export default function ImportPage() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-10">
      <Link href="/" className="inline-flex min-h-11 items-center gap-1.5 font-semibold">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Your archives
      </Link>
      <h1 className="mt-3 text-[40px] leading-[0.95] font-extrabold tracking-[-1.5px]">Import memories</h1>
      <p className="mt-3 text-muted">
        Choose a WhatsApp chat export from your iPhone, or an Instagram “Download your information”
        export in JSON format. The zip is read on this device, and only what belongs in your
        archive is sent to it.
      </p>
      <Importer />
    </main>
  )
}
