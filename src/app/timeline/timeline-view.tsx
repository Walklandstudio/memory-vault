import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  getMonthMessages,
  getMonths,
  getSpaces,
  isMonth,
  pickSpace,
  searchMessages,
  type Space,
} from '@/lib/timeline/data'
import { groupIntoDays } from '@/lib/timeline/group'
import { DayView, MonthHeader, MonthNav, PrevNext, SearchResults } from './components'

export type TimelineSearchParams = Promise<Record<string, string | string[] | undefined>>

export async function TimelineView({ searchParams }: { searchParams: TimelineSearchParams }) {
  const params = await searchParams
  const supabase = await createClient()

  const { data: auth } = await supabase.auth.getClaims()
  if (!auth?.claims) redirect('/login')

  const spaces = await getSpaces(supabase)
  const space = pickSpace(spaces, params.space)
  if (!space) return <p className="mt-10 text-sm">No archive is linked to your account yet.</p>

  const query = typeof params.q === 'string' ? params.q.trim() : ''
  const months = await getMonths(supabase, space.id)

  const header = <ArchiveHeader spaces={spaces} space={space} query={query} />

  if (months.length === 0) {
    return (
      <>
        {header}
        <p className="mt-10 text-sm">
          Nothing has been imported into this archive yet.{' '}
          <Link href={`/import?space=${space.id}`} className="underline">
            Import something
          </Link>
          .
        </p>
      </>
    )
  }

  if (query) {
    const hits = await searchMessages(supabase, space.id, query)
    return (
      <>
        {header}
        <MonthNav spaceId={space.id} months={months} current={null} />
        <SearchResults spaceId={space.id} query={query} hits={hits} />
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
      {header}
      <MonthNav spaceId={space.id} months={months} current={month} />
      <MonthHeader summary={summary} />
      <div className="mt-6 space-y-10">
        {days.map((day) => (
          <DayView key={day.date} day={day} thumbs={thumbs} />
        ))}
      </div>
      <PrevNext spaceId={space.id} months={months} current={month} />
    </>
  )
}

function ArchiveHeader({ spaces, space, query }: { spaces: Space[]; space: Space; query: string }) {
  return (
    <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs uppercase tracking-wide opacity-60">Archive</p>
        <h1 className="text-xl font-medium">{space.name}</h1>
        {spaces.length > 1 && (
          <p className="mt-1 flex flex-wrap gap-x-3 text-sm">
            {spaces
              .filter((s) => s.id !== space.id)
              .map((s) => (
                <Link key={s.id} href={`/timeline?space=${s.id}`} className="underline opacity-70 hover:opacity-100">
                  Switch to {s.name}
                </Link>
              ))}
          </p>
        )}
      </div>
      <form action="/timeline" className="flex gap-2">
        <input type="hidden" name="space" value={space.id} />
        <input
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Search this archive…"
          aria-label="Search this archive"
          className="w-56 rounded-lg border border-current/20 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-current/60"
        />
        <button
          type="submit"
          className="rounded-lg border border-current/25 px-3 py-1.5 text-sm hover:border-current/50"
        >
          Search
        </button>
      </form>
    </div>
  )
}
