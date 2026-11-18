import { Suspense } from 'react'
import Link from 'next/link'
import { TimelineView, type TimelineSearchParams } from './timeline-view'

export default function TimelinePage({ searchParams }: { searchParams: TimelineSearchParams }) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/" className="text-3xl font-semibold tracking-tight">
          Memory Vault
        </Link>
        <form action="/timeline" className="flex gap-2">
          <input
            name="q"
            type="search"
            placeholder="Search messages…"
            aria-label="Search messages"
            className="w-56 rounded-lg border border-current/20 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-current/60"
          />
          <button
            type="submit"
            className="rounded-lg border border-current/25 px-3 py-1.5 text-sm hover:border-current/50"
          >
            Search
          </button>
        </form>
      </header>

      <Suspense fallback={<p className="mt-10 text-sm opacity-70">Opening your timeline…</p>}>
        <TimelineView searchParams={searchParams} />
      </Suspense>
    </main>
  )
}
