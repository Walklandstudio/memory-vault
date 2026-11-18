import type { SupabaseClient } from '@supabase/supabase-js'

type Db = Pick<SupabaseClient, 'from' | 'rpc'>

export interface Space {
  id: string
  name: string
}

export interface MonthSummary {
  month: string // "2024-12"
  messages: number
  files: number
}

export interface TimelineMedia {
  id: string
  kind: string
  thumbPath: string | null
  mimeType: string | null
  width: number | null
  height: number | null
  durationSeconds: number | null
}

export interface TimelineAttachment {
  position: number
  exportFilename: string
  media: TimelineMedia | null
}

export interface TimelineMessage {
  id: string
  localTime: string // "2024-12-24T18:05:00", as shown on the phone
  senderName: string | null
  kind: 'text' | 'attachment' | 'system' | 'deleted' | 'omitted_media' | 'album' | 'unavailable'
  body: string
  edited: boolean
  omittedType: string | null
  attachments: TimelineAttachment[]
}

export interface SearchHit {
  id: string
  localTime: string
  senderName: string | null
  body: string
}

export async function getFirstSpace(db: Db): Promise<Space | null> {
  const { data, error } = await db.from('spaces').select('id, name').order('created_at').limit(1)
  if (error) throw new Error(error.message)
  return (data?.[0] as Space | undefined) ?? null
}

export async function getMonths(db: Db, spaceId: string): Promise<MonthSummary[]> {
  const { data, error } = await db.rpc('timeline_months', { p_space_id: spaceId })
  if (error) throw new Error(error.message)
  return (data ?? []) as MonthSummary[]
}

/** "2024-12" -> ["2024-12-01T00:00:00", "2025-01-01T00:00:00"] */
export function monthRange(month: string): [string, string] {
  const [y, m] = month.split('-').map(Number)
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  return [`${month}-01T00:00:00`, `${next}-01T00:00:00`]
}

export function isMonth(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

interface MessageRow {
  id: string
  local_time: string
  sender_name: string | null
  kind: TimelineMessage['kind']
  body: string
  edited: boolean
  omitted_type: string | null
  message_attachments: {
    position: number
    export_filename: string
    media: {
      id: string
      kind: string
      thumb_path: string | null
      mime_type: string | null
      width: number | null
      height: number | null
      duration_seconds: number | null
    } | null
  }[]
}

export async function getMonthMessages(
  db: Db,
  spaceId: string,
  month: string
): Promise<TimelineMessage[]> {
  const [start, end] = monthRange(month)
  const { data, error } = await db
    .from('messages')
    .select(
      'id, local_time, sender_name, kind, body, edited, omitted_type, ' +
        'message_attachments(position, export_filename, ' +
        'media(id, kind, thumb_path, mime_type, width, height, duration_seconds))'
    )
    .eq('space_id', spaceId)
    .gte('local_time', start)
    .lt('local_time', end)
    .order('sent_at')
    .order('source_index')
    .limit(1000)
  if (error) throw new Error(error.message)

  return ((data ?? []) as unknown as MessageRow[]).map((row) => ({
    id: row.id,
    localTime: row.local_time,
    senderName: row.sender_name,
    kind: row.kind,
    body: row.body,
    edited: row.edited,
    omittedType: row.omitted_type,
    attachments: [...(row.message_attachments ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((a) => ({
        position: a.position,
        exportFilename: a.export_filename,
        media: a.media
          ? {
              id: a.media.id,
              kind: a.media.kind,
              thumbPath: a.media.thumb_path,
              mimeType: a.media.mime_type,
              width: a.media.width,
              height: a.media.height,
              durationSeconds: a.media.duration_seconds === null ? null : Number(a.media.duration_seconds),
            }
          : null,
      })),
  }))
}

export async function searchMessages(db: Db, spaceId: string, query: string): Promise<SearchHit[]> {
  const { data, error } = await db
    .from('messages')
    .select('id, local_time, sender_name, body')
    .eq('space_id', spaceId)
    .neq('kind', 'system')
    .textSearch('search', query, { type: 'websearch', config: 'simple' })
    .order('sent_at', { ascending: false })
    .limit(100)
  if (error) throw new Error(error.message)
  return ((data ?? []) as { id: string; local_time: string; sender_name: string | null; body: string }[]).map(
    (r) => ({ id: r.id, localTime: r.local_time, senderName: r.sender_name, body: r.body })
  )
}
