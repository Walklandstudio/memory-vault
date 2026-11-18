import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSpaces, pickSpace, searchMessages } from '@/lib/timeline/data'
import { BottomNav } from '@/components/bottom-nav'
import { ArchiveSwitcher, SearchResults } from '../timeline/components'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-5 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <h1 className="text-[44px] leading-[0.95] font-extrabold tracking-[-1.5px]">Search</h1>
      <Suspense fallback={<p className="mt-6 text-muted">Opening search…</p>}>
        <SearchContent searchParams={searchParams} />
      </Suspense>
    </main>
  )
}

async function SearchContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  if (!auth?.claims) redirect('/login')

  const spaces = await getSpaces(supabase)
  const space = pickSpace(spaces, params.space)
  if (!space) redirect('/')

  const query = typeof params.q === 'string' ? params.q.trim() : ''
  const hits = query ? await searchMessages(supabase, space.id, query) : []

  return (
    <>
      <div className="mt-5">
        <ArchiveSwitcher spaces={spaces} current={space} path="/search" />
      </div>
      <form action="/search" role="search" className="mt-4 flex gap-2">
        <input type="hidden" name="space" value={space.id} />
        <label htmlFor="q" className="sr-only">
          Search {space.name}
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={query}
          placeholder={`Search ${space.name}`}
          enterKeyHint="search"
          className="h-12 min-w-0 flex-1 rounded-2xl border-2 border-line bg-card px-4 outline-none focus:border-cobalt"
        />
        <button type="submit" className="h-12 rounded-2xl bg-cobalt px-5 font-semibold text-white">
          Search
        </button>
      </form>
      {query ? (
        <SearchResults spaceId={space.id} query={query} hits={hits} />
      ) : (
        <p className="mt-6 text-[15px] text-muted">
          Find any message or caption, for example a name, a place, or “birthday”.
        </p>
      )}
      <BottomNav active="search" spaceId={space.id} />
    </>
  )
}
