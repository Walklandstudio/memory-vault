import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Opens an original photo, video or voice note through a private link
// that expires after an hour. Only members of the archive get one.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse('Not found', { status: 404 })

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  if (!auth?.claims) return new NextResponse('Please sign in', { status: 401 })

  const { data: media } = await supabase
    .from('media')
    .select('storage_path, original_filename')
    .eq('id', id)
    .maybeSingle()
  if (!media) return new NextResponse('Not found', { status: 404 })

  const download = request.nextUrl.searchParams.has('download')
  const { data, error } = await supabase.storage
    .from('media')
    .createSignedUrl(
      media.storage_path as string,
      3600,
      download ? { download: (media.original_filename as string | null) ?? true } : undefined
    )
  if (error || !data) return new NextResponse('Could not open this file', { status: 500 })

  const response = NextResponse.redirect(data.signedUrl, 302)
  response.headers.set('Cache-Control', 'private, max-age=1800')
  return response
}
