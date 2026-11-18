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
