/**
 * Instagram "Download your information" (JSON) parser.
 *
 * Turns posts, reels, archived posts and stories into the same message
 * shape the WhatsApp parser produces, so the existing import, media
 * upload and timeline all work unchanged.
 *
 *  - Captions are repaired: Meta exports store UTF-8 text as if it were
 *    Latin-1, so "can't 🎂" arrives as "canâ\x80\x99t ð\x9f\x8e\x82".
 *  - The original JSON for every post is kept, untouched, in `raw`.
 *  - Times are converted from UTC to the archive's timezone.
 *  - Locations and everything outside posts, reels and stories are ignored.
 */
import type { ParsedMessage, ParseResult } from '@/lib/whatsapp/whatsapp-ios-parser'
import { attachmentKind } from '@/lib/whatsapp/whatsapp-ios-parser'

interface IgMedia {
  uri: string
  creation_timestamp?: number
  title?: string
}

interface IgPost {
  media?: IgMedia[]
  title?: string
  creation_timestamp?: number
}

export interface InstagramFiles {
  /** Every posts_N.json file, each an array of posts */
  posts: IgPost[][]
  /** stories.json → { ig_stories: [...] } */
  stories?: { ig_stories?: IgMedia[] }
  /** reels.json → { ig_reels_media: [...] } */
  reels?: { ig_reels_media?: IgPost[] }
  /** archived_posts.json → { ig_archived_post_media: [...] } */
  archived?: { ig_archived_post_media?: IgPost[] }
  /** personal_information.json, used only for the username */
  personal?: { profile_user?: { string_map_data?: Record<string, { value?: string }> }[] }
}

/** Repairs Meta's double-encoded text. Leaves correct text untouched. */
export function fixMetaText(text: string | undefined): string {
  if (!text) return ''
  if (!/[\u0080-\u00ff]/.test(text) || /[^\u0000-\u00ff]/.test(text)) return text
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(text, (c) => c.charCodeAt(0))
    )
  } catch {
    return text
  }
}

/** Unix seconds → local wall-clock time "YYYY-MM-DDTHH:MM:SS" in the given timezone. */
export function toLocalTime(unixSeconds: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(unixSeconds * 1000))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`
}

type Item = { kind: 'post' | 'reel' | 'archived' | 'story'; post: IgPost; ts: number; original: unknown }

export function parseInstagram(
  files: InstagramFiles,
  options: { sourceId: string; timeZone: string }
): ParseResult {
  const warnings: string[] = []
  const profile = files.personal?.profile_user?.[0]?.string_map_data ?? {}
  const username = fixMetaText(profile['Username']?.value) || 'me'
  const handle = `@${username}`

  const items: Item[] = []
  const add = (kind: Item['kind'], post: IgPost, original: unknown) => {
    const ts = post.creation_timestamp ?? post.media?.[0]?.creation_timestamp
    if (!ts) {
      warnings.push(`Skipped a ${kind} with no date`)
      return
    }
    items.push({ kind, post, ts, original })
  }

  for (const file of files.posts) for (const post of file) add('post', post, post)
  for (const reel of files.reels?.ig_reels_media ?? []) add('reel', reel, reel)
  for (const post of files.archived?.ig_archived_post_media ?? []) add('archived', post, post)
  for (const story of files.stories?.ig_stories ?? [])
    add('story', { media: [story], creation_timestamp: story.creation_timestamp }, story)

  items.sort((a, b) => a.ts - b.ts)

  const seen = new Map<string, number>()
  const messages: ParsedMessage[] = items.map((item, index) => {
    const media = item.post.media ?? []
    // Single-photo posts keep the caption on the photo; carousels keep it on the post.
    const caption = fixMetaText(item.post.title || media.find((m) => m.title)?.title || '')
    const attachments = media
      .filter((m) => m.uri && !m.uri.endsWith('.srt'))
      .map((m) => ({ fileName: m.uri, kind: attachmentKind(m.uri) }))
    const timestamp = toLocalTime(item.ts, options.timeZone)
    const baseKey = ['instagram', item.kind, item.ts, attachments.map((a) => a.fileName).join(',')].join('|')
    const n = (seen.get(baseKey) ?? 0) + 1
    seen.set(baseKey, n)

    return {
      sourceId: options.sourceId,
      index,
      timestamp,
      sender: item.kind === 'story' ? `${handle} · story` : handle,
      kind: attachments.length ? 'attachment' : 'text',
      text: caption,
      attachments,
      edited: false,
      omittedType: null,
      albumId: null,
      raw: JSON.stringify(item.original),
      dedupKey: `${baseKey}#${n}`,
    }
  })

  return {
    sourceId: options.sourceId,
    chatName: `Instagram ${handle}`,
    dateOrder: 'YMD',
    dateOrderAmbiguous: false,
    messages,
    participants: [handle],
    warnings,
  }
}
