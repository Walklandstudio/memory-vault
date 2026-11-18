import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  getFirstSpace,
  getMonthMessages,
  getMonths,
  isMonth,
  searchMessages,
} from '@/lib/timeline/data'
import { groupIntoDays } from '@/lib/timeline/group'
import { DayView, MonthHeader, MonthNav, PrevNext, SearchResults } from './components'

export type TimelineSearchParams = Promise<Record<string, string | string[] | undefined>>

export async function TimelineView({ searchParams }: { searchParams: TimelineSearchParams }) {
  const params = await searchParams
  const supabase = await createClient()

  const { data: auth } = await supabase.auth.getClaims()
  if (!auth?.claims) redirect('/login')

  const space = await getFirstSpace(supabase)
  if (!space) return <p className="mt-10 text-sm">No archive is linked to your account yet.</p>

  const months = await getMonths(supabase, space.id)
  if (months.length === 0) {
    return <p className="mt-10 text-sm">Nothing has been imported yet.</p>
  }

  const query = typeof params.q === 'string' ? params.q.trim() : ''
  if (query) {
    const hits = await searchMessages(supabase, space.id, query)
    return (
      <>
        <MonthNav months={months} current={null} />
        <SearchResults query={query} hits={hits} />
      </>
    )
  }

  const requested = params.month
  const month =
    isMonth(requested) && months.some((m) => m.month === requested)
      ? requested
      : months[months.length - 1].month
  const summary = months.find((m) => m.month === month)!

  const messages = await getMonthMessages(supabase, space.id, month)
  const days = groupIntoDays(messages)

  // Private preview links for this month's thumbnails (valid for 1 hour)
  const thumbPaths = [
    ...new Set(
      messages.flatMap((m) =>
        m.attachments.flatMap((a) => (a.media?.thumbPath ? [a.media.thumbPath] : []))
      )
    ),
  ]
  const thumbs: Record<string, string> = {}
  if (thumbPaths.length) {
    const { data } = await supabase.storage.from('media').createSignedUrls(thumbPaths, 3600)
    for (const s of data ?? []) if (s.path && s.signedUrl) thumbs[s.path] = s.signedUrl
  }

  return (
    <>
      <MonthNav months={months} current={month} />
      <MonthHeader summary={summary} />
      <div className="mt-6 space-y-10">
        {days.map((day) => (
          <DayView key={day.date} day={day} thumbs={thumbs} />
        ))}
      </div>
      <PrevNext months={months} current={month} />
    </>
  )
}
