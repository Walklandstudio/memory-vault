import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSpaces, type Space } from '@/lib/timeline/data'
import { createArchive } from './actions'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default function Home({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">Memory Vault</h1>
        <form action="/auth/signout" method="post">
          <button type="submit" className="text-sm underline opacity-70 hover:opacity-100">
            Sign out
          </button>
        </form>
      </header>

      {/* Anything that reads the login session loads inside this boundary */}
      <Suspense fallback={<p className="mt-10 text-sm opacity-70">Opening your archives…</p>}>
        <Archives searchParams={searchParams} />
      </Suspense>
    </main>
  )
}

async function Archives({ searchParams }: { searchParams: SearchParams }) {
  const { error: formError } = await searchParams
  const supabase = await createClient()

  // Always verify who is signed in on the server before showing anything.
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims) redirect('/login')

  let spaces: Space[] = []
  let loadError: string | null = null
  try {
    spaces = await getSpaces(supabase)
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err)
  }

  return (
    <>
      <p className="mt-2 text-sm opacity-70">Signed in as {String(claims.email ?? '')}</p>

      <section className="mt-10 space-y-6">
        {loadError && (
          <p className="rounded-lg border border-red-600/40 p-4 text-sm text-red-600">
            Couldn’t load your archives: {loadError}
          </p>
        )}

        {spaces.map((space) => (
          <ArchiveCard key={space.id} space={space} />
        ))}

        <form action={createArchive} className="rounded-xl border border-dashed border-current/25 p-6">
          <label htmlFor="new-archive" className="font-medium">
            Create a new archive
          </label>
          <p className="mt-1 text-sm opacity-70">
            Each archive has its own timeline, imports and privacy.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <input
              id="new-archive"
              name="name"
              required
              maxLength={100}
              placeholder="e.g. My Instagram"
              className="min-w-0 flex-1 rounded-lg border border-current/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-current/60"
            />
            <button
              type="submit"
              className="rounded-lg border border-current/25 px-4 py-2 text-sm hover:border-current/50"
            >
              Create archive
            </button>
          </div>
          {formError && (
            <p className="mt-3 text-sm text-red-600" role="alert">
              {formError === 'name' ? 'Please give the archive a name.' : 'The archive couldn’t be created. Please try again.'}
            </p>
          )}
        </form>
      </section>
    </>
  )
}

async function ArchiveCard({ space }: { space: Space }) {
  const supabase = await createClient()

  const [{ count: messageCount }, { count: mediaCount }, { data: sources }, { data: recent }] =
    await Promise.all([
      supabase.from('messages').select('*', { count: 'exact', head: true }).eq('space_id', space.id),
      supabase.from('media').select('*', { count: 'exact', head: true }).eq('space_id', space.id),
      supabase
        .from('sources')
        .select('id, label, status')
        .eq('space_id', space.id)
        .order('imported_at'),
      supabase
        .from('media')
        .select('id, thumb_path')
        .eq('space_id', space.id)
        .eq('kind', 'photo')
        .not('thumb_path', 'is', null)
        .order('taken_at', { ascending: false })
        .limit(8),
    ])

  // Latest previews, shown through short-lived private links (valid for 1 hour)
  const thumbPaths = (recent ?? []).map((m) => m.thumb_path as string)
  const { data: signed } = thumbPaths.length
    ? await supabase.storage.from('media').createSignedUrls(thumbPaths, 3600)
    : { data: [] }
  const previews = (signed ?? []).flatMap((s) =>
    s.signedUrl ? [{ path: s.path ?? s.signedUrl, url: s.signedUrl }] : []
  )
  const isEmpty = (messageCount ?? 0) === 0 && (mediaCount ?? 0) === 0

  return (
    <div className="rounded-xl border border-current/20 p-6">
      <h2 className="text-xl font-medium">{space.name}</h2>
      <p className="mt-1 text-sm opacity-70">
        {isEmpty
          ? 'Nothing imported yet.'
          : `${(messageCount ?? 0).toLocaleString()} messages and ${(mediaCount ?? 0).toLocaleString()} photos, videos & voice notes preserved so far.`}
      </p>

      {previews.length > 0 && (
        <div className="mt-4 grid grid-cols-4 gap-2">
          {previews.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={p.path}
              src={p.url}
              alt=""
              className="aspect-square w-full rounded-lg object-cover"
            />
          ))}
        </div>
      )}

      {sources && sources.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm">
          {sources.map((source) => (
            <li key={source.id}>
              {source.label}
              <span className="opacity-60">
                {source.status === 'complete' ? ' · imported' : ' · import not finished'}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        {!isEmpty && (
          <Link
            href={`/timeline?space=${space.id}`}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            Open the timeline
          </Link>
        )}
        <Link
          href={`/import?space=${space.id}`}
          className={
            isEmpty
              ? 'rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90'
              : 'rounded-lg border border-current/25 px-4 py-2 text-sm hover:border-current/50'
          }
        >
          Import
        </Link>
      </div>
    </div>
  )
}
