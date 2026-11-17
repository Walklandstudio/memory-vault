import type { ParsedMessage } from '@/lib/whatsapp/whatsapp-ios-parser'

// The shape import_messages() expects for each message.
export interface ImportRow {
  source_index: number
  local_time: string
  sender_name: string | null
  kind: ParsedMessage['kind']
  body: string
  edited: boolean
  omitted_type: string | null
  album_index: number | null
  raw: string
  dedup_key: string
  attachments: { fileName: string; kind: string }[]
}

export function toImportRow(m: ParsedMessage): ImportRow {
  return {
    source_index: m.index,
    local_time: m.timestamp,
    sender_name: m.sender,
    kind: m.kind,
    body: m.text,
    edited: m.edited,
    omitted_type: m.omittedType,
    album_index: m.albumId,
    raw: m.raw,
    dedup_key: m.dedupKey,
    attachments: m.attachments,
  }
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
