import { Suspense } from 'react'
import Link from 'next/link'
import { TimelineView, type TimelineSearchParams } from './timeline-view'

export default function TimelinePage({ searchParams }: { searchParams: TimelineSearchParams }) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <Link href="/" className="text-3xl font-semibold tracking-tight">
        Memory Vault
      </Link>

      <Suspense fallback={<p className="mt-10 text-sm opacity-70">Opening your timeline…</p>}>
        <TimelineView searchParams={searchParams} />
      </Suspense>
    </main>
  )
}
