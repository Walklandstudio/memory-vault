import Link from 'next/link'
import type { MonthSummary, SearchHit } from '@/lib/timeline/data'
import type { Block, Day, GalleryItem, Moment } from '@/lib/timeline/group'

type Thumbs = Record<string, string>

const monthName = (month: string, style: 'long' | 'short' = 'long') =>
  new Date(month + '-01T00:00:00Z').toLocaleDateString('en-ZA', {
    month: style,
    year: style === 'long' ? 'numeric' : undefined,
    timeZone: 'UTC',
  })

const dayName = (date: string) =>
  new Date(date + 'T00:00:00Z').toLocaleDateString('en-ZA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`

// ---------- Navigation ----------

export function MonthNav({
  spaceId,
  months,
  current,
}: {
  spaceId: string
  months: MonthSummary[]
  current: string | null
}) {
  const href = (month: string) => `/timeline?space=${spaceId}&month=${month}`
  const years = [...new Set(months.map((m) => m.month.slice(0, 4)))]
  const currentYear = (current ?? months[months.length - 1].month).slice(0, 4)
  const yearMonths = months.filter((m) => m.month.startsWith(currentYear))

  return (
    <nav className="mt-8 space-y-3" aria-label="Timeline">
      <div className="flex flex-wrap gap-2">
        {years.map((year) => {
          const latest = months.filter((m) => m.month.startsWith(year)).at(-1)!.month
          const active = year === currentYear && current !== null
          return (
            <Link
              key={year}
              href={href(latest)}
              className={`rounded-full px-3 py-1 text-sm ${
                active ? 'bg-foreground text-background' : 'border border-current/20 hover:border-current/50'
              }`}
            >
              {year}
            </Link>
          )
        })}
      </div>
      {current && (
        <div className="flex flex-wrap gap-2">
          {yearMonths.map((m) => (
            <Link
              key={m.month}
              href={href(m.month)}
              className={`rounded-lg px-2.5 py-1 text-xs ${
                m.month === current
                  ? 'bg-current/15 font-semibold'
                  : 'opacity-70 hover:bg-current/10 hover:opacity-100'
              }`}
            >
              {monthName(m.month, 'short')} <span className="opacity-60">{m.messages}</span>
            </Link>
          ))}
        </div>
      )}
    </nav>
  )
}

export function MonthHeader({ summary }: { summary: MonthSummary }) {
  return (
    <div className="mt-8 border-b border-current/15 pb-4">
      <h2 className="text-2xl font-semibold">{monthName(summary.month)}</h2>
      <p className="mt-1 text-sm opacity-70">
        {plural(summary.messages, 'message')} ·{' '}
        {summary.files === 1 ? '1 file' : `${summary.files.toLocaleString()} photos, videos & voice notes`}
      </p>
    </div>
  )
}

export function PrevNext({
  spaceId,
  months,
  current,
}: {
  spaceId: string
  months: MonthSummary[]
  current: string
}) {
  const href = (month: string) => `/timeline?space=${spaceId}&month=${month}`
  const i = months.findIndex((m) => m.month === current)
  const prev = months[i - 1]
  const next = months[i + 1]
  return (
    <div className="mt-12 flex justify-between border-t border-current/15 pt-6 text-sm">
      {prev ? (
        <Link href={href(prev.month)} className="underline opacity-80 hover:opacity-100">
          ← {monthName(prev.month)}
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link href={href(next.month)} className="underline opacity-80 hover:opacity-100">
          {monthName(next.month)} →
        </Link>
      ) : (
        <span />
      )}
    </div>
  )
}

// ---------- Days and moments ----------

export function DayView({ day, thumbs }: { day: Day; thumbs: Thumbs }) {
  return (
    <section>
      <h3 className="sticky top-0 z-10 bg-background/90 py-2 text-sm font-semibold backdrop-blur">
        {dayName(day.date)}
      </h3>
      <div className="mt-3 space-y-5">
        {day.moments.map((moment) => (
          <MomentView key={moment.key} moment={moment} thumbs={thumbs} />
        ))}
      </div>
    </section>
  )
}

function MomentView({ moment, thumbs }: { moment: Moment; thumbs: Thumbs }) {
  if (moment.system) {
    const block = moment.blocks[0]
    return (
      <p
        id={block.type === 'text' ? `m-${block.messageId}` : undefined}
        className="scroll-mt-16 text-center text-xs opacity-55 target:opacity-100"
      >
        {block.type === 'text' ? block.body : ''} · {moment.time}
      </p>
    )
  }
  return (
    <article className="rounded-xl border border-current/10 p-4">
      <p className="text-sm">
        <span className="font-semibold">{moment.sender ?? 'Unknown'}</span>
        <span className="ml-2 opacity-55">{moment.time}</span>
      </p>
      <div className="mt-2 space-y-3">
        {moment.blocks.map((block, i) => (
          <BlockView key={i} block={block} thumbs={thumbs} />
        ))}
      </div>
    </article>
  )
}

const targetStyle = 'scroll-mt-16 rounded target:ring-2 target:ring-amber-500 target:ring-offset-4'

function BlockView({ block, thumbs }: { block: Block; thumbs: Thumbs }) {
  if (block.type === 'text') {
    return (
      <p id={`m-${block.messageId}`} className={`whitespace-pre-wrap break-words ${targetStyle}`}>
        {block.body}
        {block.edited && <span className="ml-1 text-xs opacity-50">(edited)</span>}
      </p>
    )
  }
  if (block.type === 'notice') {
    return (
      <p id={`m-${block.messageId}`} className={`text-sm italic opacity-55 ${targetStyle}`}>
        {block.text}
      </p>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {block.items.map((item, i) => (
        <GalleryTile
          key={`${item.messageId}-${i}`}
          item={item}
          anchor={i === 0 || block.items[i - 1].messageId !== item.messageId}
          thumbs={thumbs}
        />
      ))}
    </div>
  )
}

// ---------- Photos, videos and voice notes ----------

function GalleryTile({ item, anchor, thumbs }: { item: GalleryItem; anchor: boolean; thumbs: Thumbs }) {
  const media = item.attachment?.media ?? null
  const isAudio = media?.kind === 'audio'
  const id = anchor ? `m-${item.messageId}` : undefined

  return (
    <figure id={id} className={`${isAudio ? 'col-span-full' : ''} ${targetStyle}`}>
      <MediaView item={item} thumbs={thumbs} />
      {item.caption && (
        <figcaption className="mt-1 whitespace-pre-wrap break-words text-xs opacity-75">
          {item.caption}
        </figcaption>
      )}
    </figure>
  )
}

function Placeholder({ text }: { text: string }) {
  return (
    <div className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-current/30 p-3 text-center text-xs opacity-60">
      {text}
    </div>
  )
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return ''
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function MediaView({ item, thumbs }: { item: GalleryItem; thumbs: Thumbs }) {
  if (!item.attachment) {
    return <Placeholder text={`${item.omittedType === 'image' ? 'Photo' : 'File'} not included in WhatsApp’s export`} />
  }
  const media = item.attachment.media
  if (!media) return <Placeholder text={`Not in this export: ${item.attachment.exportFilename}`} />

  const src = `/media/${media.id}`
  const thumb = media.thumbPath ? thumbs[media.thumbPath] : undefined

  switch (media.kind) {
    case 'video':
      return (
        <video
          controls
          preload="none"
          poster={thumb}
          src={src}
          className="aspect-square w-full rounded-lg bg-black object-cover"
        />
      )
    case 'gif':
      return (
        <video
          autoPlay
          loop
          muted
          playsInline
          poster={thumb}
          src={src}
          className="aspect-square w-full rounded-lg bg-black object-cover"
        />
      )
    case 'audio':
      return (
        <div className="rounded-lg border border-current/15 p-3">
          <p className="mb-2 text-xs opacity-70">
            Voice note{media.durationSeconds !== null && ` (${formatDuration(media.durationSeconds)})`} ·{' '}
            <a href={`${src}?download`} className="underline">
              download
            </a>
          </p>
          <audio controls preload="none" src={src} className="w-full" />
        </div>
      )
    case 'photo':
    case 'sticker':
      return (
        <a href={src} target="_blank" rel="noopener" title="Open the original">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumb ?? src}
            alt={item.caption || (media.kind === 'sticker' ? 'Sticker' : 'Photo')}
            loading="lazy"
            className={`aspect-square w-full rounded-lg ${media.kind === 'sticker' ? 'object-contain' : 'object-cover'}`}
          />
        </a>
      )
    default:
      return (
        <a href={`${src}?download`} className="block">
          <Placeholder text={`Download ${item.attachment.exportFilename}`} />
        </a>
      )
  }
}

// ---------- Search ----------

function highlight(text: string, query: string) {
  const words = query.match(/[\p{L}\p{N}]+/gu) ?? []
  if (!words.length) return text
  const pattern = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'giu')
  return text.split(pattern).map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded bg-amber-300/60 px-0.5 text-inherit">
        {part}
      </mark>
    ) : (
      part
    )
  )
}

export function SearchResults({
  spaceId,
  query,
  hits,
}: {
  spaceId: string
  query: string
  hits: SearchHit[]
}) {
  return (
    <section className="mt-8">
      <h2 className="text-2xl font-semibold">Results for “{query}”</h2>
      <p className="mt-1 text-sm opacity-70">
        {hits.length === 0
          ? 'No messages matched. Try fewer or different words.'
          : `${plural(hits.length, 'message')}${hits.length === 100 ? ' (showing the 100 most recent)' : ''}`}
      </p>
      <ul className="mt-6 space-y-3">
        {hits.map((hit) => (
          <li key={hit.id}>
            <Link
              href={`/timeline?space=${spaceId}&month=${hit.localTime.slice(0, 7)}#m-${hit.id}`}
              className="block rounded-xl border border-current/10 p-4 hover:border-current/30"
            >
              <p className="text-xs opacity-60">
                {dayName(hit.localTime.slice(0, 10))} · {hit.localTime.slice(11, 16)} ·{' '}
                {hit.senderName ?? 'Group'}
              </p>
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm">
                {highlight(hit.body, query)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
