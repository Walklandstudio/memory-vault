import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default function Home() {
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
      <Suspense fallback={<p className="mt-10 text-sm opacity-70">Opening your archive…</p>}>
        <Archive />
      </Suspense>
    </main>
  )
}

async function Archive() {
  const supabase = await createClient()

  // Always verify who is signed in on the server before showing anything.
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims) redirect('/login')

  const { data: spaces, error } = await supabase
    .from('spaces')
    .select('id, name, created_at')
    .order('created_at')

  const { count: messageCount } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })

  const { data: sources } = await supabase
    .from('sources')
    .select('id, label, status')
    .order('imported_at')

  const { count: mediaCount } = await supabase
    .from('media')
    .select('*', { count: 'exact', head: true })

  // Latest previews, shown through short-lived private links (valid for 1 hour)
  const { data: recent } = await supabase
    .from('media')
    .select('id, thumb_path')
    .not('thumb_path', 'is', null)
    .order('taken_at', { ascending: false })
    .limit(8)
  const thumbPaths = (recent ?? []).map((m) => m.thumb_path as string)
  const { data: signed } = thumbPaths.length
    ? await supabase.storage.from('media').createSignedUrls(thumbPaths, 3600)
    : { data: [] }
  const previews = (signed ?? []).flatMap((s) =>
    s.signedUrl ? [{ path: s.path ?? s.signedUrl, url: s.signedUrl }] : []
  )

  return (
    <>
      <p className="mt-2 text-sm opacity-70">Signed in as {String(claims.email ?? '')}</p>

      <section className="mt-10 space-y-4">
        {error && (
          <p className="rounded-lg border border-red-600/40 p-4 text-sm text-red-600">
            Couldn’t load your archives: {error.message}
          </p>
        )}

        {!error && spaces?.length === 0 && (
          <p className="rounded-lg border border-current/20 p-4 text-sm">
            You’re signed in, but no archive is linked to your account yet.
          </p>
        )}

        {spaces?.map((space) => (
          <div key={space.id} className="rounded-xl border border-current/20 p-6">
            <h2 className="text-xl font-medium">{space.name}</h2>
            <p className="mt-1 text-sm opacity-70">
              {(messageCount ?? 0).toLocaleString()} messages and{' '}
              {(mediaCount ?? 0).toLocaleString()} photos, videos & voice notes preserved so far.
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
            <Link
              href="/import"
              className="mt-5 inline-block rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
            >
              Import a WhatsApp chat
            </Link>
          </div>
        ))}
      </section>
    </>
  )
}
