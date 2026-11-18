import type { TimelineAttachment, TimelineMessage } from './data'

// Turns a month of messages into days and "moments":
// consecutive messages from one person within a few minutes.

export interface GalleryItem {
  messageId: string
  attachment: TimelineAttachment | null // null = WhatsApp left the file out
  omittedType: string | null
  caption: string
}

export type Block =
  | { type: 'text'; messageId: string; body: string; edited: boolean }
  | { type: 'notice'; messageId: string; text: string } // deleted / never arrived
  | { type: 'gallery'; items: GalleryItem[] }

export interface Moment {
  key: string
  system: boolean
  sender: string | null
  time: string // "18:05"
  blocks: Block[]
}

export interface Day {
  date: string // "2024-12-24"
  moments: Moment[]
}

const MOMENT_GAP_MINUTES = 10

const minutesBetween = (a: string, b: string) =>
  Math.abs(Date.parse(b + 'Z') - Date.parse(a + 'Z')) / 60000

export function groupIntoDays(messages: TimelineMessage[]): Day[] {
  const days: Day[] = []
  let day: Day | null = null
  let moment: Moment | null = null
  let lastTime = ''

  for (const m of messages) {
    if (m.kind === 'album') continue // album headers carry no content

    const date = m.localTime.slice(0, 10)
    if (!day || day.date !== date) {
      day = { date, moments: [] }
      days.push(day)
      moment = null
    }

    if (m.kind === 'system') {
      day.moments.push({
        key: m.id,
        system: true,
        sender: null,
        time: m.localTime.slice(11, 16),
        blocks: [{ type: 'text', messageId: m.id, body: m.body, edited: false }],
      })
      moment = null
      continue
    }

    const startNew =
      !moment ||
      moment.sender !== m.senderName ||
      minutesBetween(lastTime, m.localTime) > MOMENT_GAP_MINUTES
    if (startNew) {
      moment = {
        key: m.id,
        system: false,
        sender: m.senderName,
        time: m.localTime.slice(11, 16),
        blocks: [],
      }
      day.moments.push(moment)
    }
    lastTime = m.localTime
    const current = moment as Moment

    if (m.kind === 'attachment' || m.kind === 'omitted_media') {
      const items: GalleryItem[] =
        m.kind === 'omitted_media'
          ? [{ messageId: m.id, attachment: null, omittedType: m.omittedType, caption: m.body }]
          : m.attachments.map((a, i) => ({
              messageId: m.id,
              attachment: a,
              omittedType: null,
              caption: i === 0 ? m.body : '',
            }))
      const last = current.blocks[current.blocks.length - 1]
      if (last?.type === 'gallery') last.items.push(...items)
      else current.blocks.push({ type: 'gallery', items })
    } else if (m.kind === 'deleted') {
      current.blocks.push({ type: 'notice', messageId: m.id, text: 'This message was deleted' })
    } else if (m.kind === 'unavailable') {
      current.blocks.push({ type: 'notice', messageId: m.id, text: 'This message never arrived' })
    } else {
      current.blocks.push({ type: 'text', messageId: m.id, body: m.body, edited: m.edited })
    }
  }
  return days
}

// ---------- Fan mail ----------
// On a day with photos, replies from other people fold into one "fan mail" row
// so the photos lead. Days that are only conversation are shown in full.

export type DayEntry =
  | { type: 'moment'; moment: Moment }
  | { type: 'fanmail'; key: string; moments: Moment[]; names: string[]; messages: number }

const hasGallery = (m: Moment) => m.blocks.some((b) => b.type === 'gallery')

export function withFanMail(day: Day): DayEntry[] {
  const entries: DayEntry[] = []
  let photoSender: string | null = null

  for (const moment of day.moments) {
    if (moment.system) {
      entries.push({ type: 'moment', moment })
      continue
    }
    if (hasGallery(moment)) {
      photoSender = moment.sender
      entries.push({ type: 'moment', moment })
      continue
    }
    const isReply = photoSender !== null && moment.sender !== photoSender
    if (!isReply) {
      entries.push({ type: 'moment', moment })
      continue
    }
    const last = entries[entries.length - 1]
    const group =
      last?.type === 'fanmail'
        ? last
        : (entries[entries.push({ type: 'fanmail', key: moment.key, moments: [], names: [], messages: 0 }) - 1] as Extract<
            DayEntry,
            { type: 'fanmail' }
          >)
    group.moments.push(moment)
    group.messages += moment.blocks.length
    if (moment.sender && !group.names.includes(moment.sender)) group.names.push(moment.sender)
  }
  return entries
}

// ---------- Photo viewer ----------

export interface ViewerItem {
  /** "<messageId>#<attachment position>", so a photo in the timeline can find its place in the viewer */
  key: string
  mediaId: string
  kind: string
  thumbPath: string | null
  width: number | null
  height: number | null
  messageId: string
  caption: string
  sender: string | null
  time: string
}

const VIEWABLE = new Set(['photo', 'video', 'gif', 'sticker'])

/** Every photo and video in a day, in order, for swiping through full screen. */
export function viewerItems(day: Day): ViewerItem[] {
  const items: ViewerItem[] = []
  for (const moment of day.moments) {
    for (const block of moment.blocks) {
      if (block.type !== 'gallery') continue
      for (const item of block.items) {
        const media = item.attachment?.media
        if (!media || !VIEWABLE.has(media.kind)) continue
        items.push({
          key: viewerKey(item),
          mediaId: media.id,
          kind: media.kind,
          thumbPath: media.thumbPath,
          width: media.width,
          height: media.height,
          messageId: item.messageId,
          caption: item.caption,
          sender: moment.sender,
          time: moment.time,
        })
      }
    }
  }
  return items
}

export const viewerKey = (item: GalleryItem) => `${item.messageId}#${item.attachment?.position ?? 0}`
