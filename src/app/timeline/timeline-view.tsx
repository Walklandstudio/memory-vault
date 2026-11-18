import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMonthMessages, getMonths, getSpaces, isMonth, pickSpace } from '@/lib/timeline/data'
import { groupIntoDays, viewerItems } from '@/lib/timeline/group'
import { longDay } from '@/lib/display'
import { BottomNav } from '@/components/bottom-nav'
import { ArchiveSwitcher, DayView, MonthHeader, MonthNav, PrevNext } from './components'
import { ViewerProvider, type ViewerPhoto } from './viewer'

export type TimelineSearchParams = Promise<Record<string, string | string[] | undefined>>

export async function TimelineView({ searchParams }: { searchParams: TimelineSearchParams }) {
  const params = await searchParams
  const supabase = await createClient()

  const { data: auth } = await supabase.auth.getClaims()
  if (!auth?.claims) redirect('/login')

  const spaces = await getSpaces(supabase)
  const space = pickSpace(spaces, params.space)
  if (!space) redirect('/')

  // Searching now has its own page; keep old links working
  if (typeof params.q === 'string' && params.q.trim()) {
    redirect(`/search?space=${space.id}&q=${encodeURIComponent(params.q.trim())}`)
  }

  const months = await getMonths(supabase, space.id)
  if (months.length === 0) {
    return (
      <>
        <ArchiveSwitcher spaces={spaces} current={space} path="/timeline" />
        <div className="mt-10 flex flex-col items-start gap-4">
          <h1 className="text-[34px] leading-none font-extrabold">{space.name}</h1>
          <p className="text-muted">Nothing is in this archive yet. Import a WhatsApp chat or an Instagram export to fill it.</p>
          <Link href={`/import?space=${space.id}`} className="flex h-12 items-center rounded-2xl bg-cobalt px-5 font-semibold text-white">
            Import memories
          </Link>
        </div>
        <BottomNav active="timeline" spaceId={space.id} />
      </>
    )
  }

  const requested = params.month
  const month =
    isMonth(requested) && months.some((m) => m.month === requested) ? requested : months[months.length - 1].month
  const summary = months.find((m) => m.month === month)!

  const messages = await getMonthMessages(supabase, space.id, month)
  const days = groupIntoDays(messages)

  // Private preview links for this month's thumbnails (valid for 1 hour)
  const thumbPaths = [
    ...new Set(messages.flatMap((m) => m.attachments.flatMap((a) => (a.media?.thumbPath ? [a.media.thumbPath] : [])))),
  ]
  const thumbs: Record<string, string> = {}
  if (thumbPaths.length) {
    const { data } = await supabase.storage.from('media').createSignedUrls(thumbPaths, 3600)
    for (const s of data ?? []) if (s.path && s.signedUrl) thumbs[s.path] = s.signedUrl
  }

  // What the full-screen viewer swipes through, day by day
  const viewerDays: Record<string, ViewerPhoto[]> = {}
  const dayLabels: Record<string, string> = {}
  for (const day of days) {
    viewerDays[day.date] = viewerItems(day).map((item) => ({
      ...item,
      thumbUrl: item.thumbPath ? thumbs[item.thumbPath] : undefined,
    }))
    dayLabels[day.date] = longDay(day.date)
  }

  return (
    <ViewerProvider days={viewerDays} dayLabels={dayLabels}>
      <div className="flex flex-col gap-4">
        <ArchiveSwitcher spaces={spaces} current={space} path="/timeline" />
        <MonthNav spaceId={space.id} months={months} current={month} />
      </div>
      <MonthHeader summary={summary} />
      <div className="mt-8 flex flex-col gap-12">
        {days.map((day) => (
          <DayView key={day.date} day={day} thumbs={thumbs} />
        ))}
      </div>
      <PrevNext spaceId={space.id} months={months} current={month} />
      <BottomNav active="timeline" spaceId={space.id} />
    </ViewerProvider>
  )
}
