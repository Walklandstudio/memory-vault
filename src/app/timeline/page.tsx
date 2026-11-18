import { Suspense } from 'react'
import { TimelineView, type TimelineSearchParams } from './timeline-view'

export default function TimelinePage({ searchParams }: { searchParams: TimelineSearchParams }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-5 pt-[max(1rem,env(safe-area-inset-top))]">
      <Suspense fallback={<p className="mt-10 text-muted">Opening your timeline…</p>}>
        <TimelineView searchParams={searchParams} />
      </Suspense>
    </main>
  )
}
