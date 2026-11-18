import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  getArchiveSummary,
  getFeaturedDay,
  getSpaces,
  type ArchiveSummary,
  type Space,
} from '@/lib/timeline/data'
import { count, firstNameFromEmail, longDay, monthName, plural } from '@/lib/display'
import { BottomNav } from '@/components/bottom-nav'
import { createArchive } from './actions'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default function Home({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-5 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <Suspense fallback={<p className="mt-10 text-muted">Opening your archives…</p>}>
        <HomeContent searchParams={searchParams} />
      </Suspense>
    </main>
  )
}

async function HomeContent({ searchParams }: { searchParams: SearchParams }) {
  const { error: formError } = await searchParams
  const supabase = await createClient()

  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims) redirect('/login')

  const spaces = await getSpaces(supabase)
  const summaries = await Promise.all(spaces.map((s) => getArchiveSummary(supabase, s.id)))
  const firstWithContent = spaces.find((_, i) => summaries[i].messages > 0)
  const name = firstNameFromEmail(String(claims.email ?? ''))

  return (
    <>
      <header className="flex items-center justify-between">
        <p className="text-muted">{name ? `Hi ${name}` : 'Hello'}</p>
        <form action="/auth/signout" method="post">
          <button type="submit" className="min-h-11 px-2 text-[15px] text-muted underline underline-offset-4">
            Sign out
          </button>
        </form>
      </header>

      <h1 className="mt-3 text-[44px] leading-[0.95] font-extrabold tracking-[-1.5px]">
        Your
        <br />
        archives
      </h1>

      <section className="mt-6 flex flex-col gap-4" aria-label="Archives">
        {spaces.map((space, i) => (
          <MembershipCard key={space.id} space={space} summary={summaries[i]} index={i} />
        ))}
      </section>

      {firstWithContent && (
        <Suspense fallback={null}>
          <WorthAnotherLook space={firstWithContent} />
        </Suspense>
      )}

      <div className="mt-8 flex flex-col gap-3">
        <Link
          href={`/import${spaces[0] ? `?space=${spaces[0].id}` : ''}`}
          className="flex h-12 items-center justify-center rounded-2xl bg-ink font-semibold text-white"
        >
          Import memories
        </Link>
        <details className="group rounded-2xl border-2 border-dashed border-[#9aa3c7]" open={Boolean(formError)}>
          <summary className="flex h-12 cursor-pointer list-none items-center justify-center font-semibold">
            Start a new archive
          </summary>
          <form action={createArchive} className="flex flex-col gap-3 px-4 pb-4">
            <label htmlFor="new-archive" className="text-[15px] text-muted">
              Each archive has its own timeline and its own privacy.
            </label>
            <input
              id="new-archive"
              name="name"
              required
              maxLength={100}
              placeholder="For example: Grandpa’s letters"
              className="h-12 rounded-xl border border-line bg-card px-3 outline-none focus:border-cobalt"
            />
            <button type="submit" className="h-12 rounded-xl bg-cobalt font-semibold text-white">
              Create archive
            </button>
            {formError && (
              <p className="text-[15px] text-[#B3261E]" role="alert">
                {formError === 'name'
                  ? 'Give the archive a name to create it.'
                  : 'The archive wasn’t created. Check your connection and try again.'}
              </p>
            )}
          </form>
        </details>
      </div>

      <BottomNav active="home" spaceId={firstWithContent?.id ?? spaces[0]?.id} />
    </>
  )
}

// Each archive is a fan club membership card, with a tear-off stub to open it.
const CARD_STYLES = [
  { card: 'bg-cobalt text-white', sub: 'text-cobalt-soft', stub: 'border-[#8fa0ff] text-sunny' },
  { card: 'bg-sunny text-ink', sub: 'text-[#5a4a00]', stub: 'border-[#c9a200] text-ink' },
  { card: 'bg-ink text-white', sub: 'text-night-muted', stub: 'border-[#4a5280] text-sunny' },
]

function MembershipCard({ space, summary, index }: { space: Space; summary: ArchiveSummary; index: number }) {
  const style = CARD_STYLES[index % CARD_STYLES.length]
  const empty = summary.messages === 0
  const href = empty ? `/import?space=${space.id}` : `/timeline?space=${space.id}`

  return (
    <Link href={href} className={`flex overflow-hidden rounded-[20px] ${style.card}`}>
      <div className="flex flex-1 flex-col gap-2.5 p-[18px]">
        <p className={`text-[14px] ${style.sub}`}>
          {summary.since ? `Member since ${monthName(summary.since.slice(0, 7))}` : 'Nothing imported yet'}
        </p>
        <p className="text-[28px] leading-none font-extrabold tracking-[-0.5px]">{space.name}</p>
        {!empty && (
          <p className="flex flex-wrap gap-x-4 text-[15px]">
            <span>
              <strong className="text-[20px] font-extrabold">{count(summary.files)}</strong> photos &amp; videos
            </span>
            {summary.onlyInstagram ? (
              <span>
                <strong className="text-[20px] font-extrabold">{count(summary.messages)}</strong> posts
              </span>
            ) : (
              <span>
                <strong className="text-[20px] font-extrabold">{count(summary.people)}</strong> fans
              </span>
            )}
          </p>
        )}
      </div>
      <div className={`flex w-16 items-center justify-center border-l-2 border-dashed ${style.stub}`}>
        <span className="rotate-180 text-[15px] font-extrabold [writing-mode:vertical-rl]">
          {empty ? 'Import' : 'Open'}
        </span>
      </div>
    </Link>
  )
}

async function WorthAnotherLook({ space }: { space: Space }) {
  const supabase = await createClient()
  const featured = await getFeaturedDay(supabase, space.id)
  if (!featured) return null

  const paths = featured.thumbs ?? []
  const { data: signed } = paths.length
    ? await supabase.storage.from('media').createSignedUrls(paths, 3600)
    : { data: [] }
  const urls = (signed ?? []).flatMap((s) => (s.signedUrl ? [s.signedUrl] : []))

  return (
    <section className="mt-8" aria-labelledby="worth-another-look">
      <h2 id="worth-another-look" className="text-[22px] font-extrabold">
        Worth another look
      </h2>
      <Link
        href={`/timeline?space=${space.id}&month=${featured.day.slice(0, 7)}#d-${featured.day}`}
        className="mt-3 flex items-center gap-4 rounded-2xl bg-card p-3"
      >
        <div className="flex shrink-0 gap-1" aria-hidden="true">
          {urls.slice(0, 2).map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={url}
              src={url}
              alt=""
              className={`h-[74px] w-[58px] rounded-[10px] object-cover ${i === 0 ? '-rotate-3' : 'rotate-2'}`}
            />
          ))}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[17px] font-extrabold">{longDay(featured.day)}</span>
          {featured.caption && <span className="truncate text-[15px] text-muted">{featured.caption}</span>}
          <span className="text-[15px] text-muted">{plural(featured.photos, 'photo')}</span>
        </div>
      </Link>
    </section>
  )
}
