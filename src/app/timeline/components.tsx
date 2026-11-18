import Link from 'next/link'
import type { MonthSummary, SearchHit, Space } from '@/lib/timeline/data'
import type { Block, Day, DayEntry, GalleryItem, Moment } from '@/lib/timeline/group'
import { viewerItems, viewerKey, withFanMail } from '@/lib/timeline/group'
import { count, initials, listNames, longDay, monthName, personColour, plural, weekday } from '@/lib/display'
import { PhotoButton } from './viewer'

type Thumbs = Record<string, string>
type Positions = Map<string, number>
const timelineHref = (spaceId: string, month: string) => `/timeline?space=${spaceId}&month=${month}`

// ---------- Archive and month navigation ----------

export function ArchiveSwitcher({ spaces, current, path }: { spaces: Space[]; current: Space; path: string }) {
  if (spaces.length < 2) return null
  return (
    <nav aria-label="Archives" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
      {spaces.map((s) => (
        <Link
          key={s.id}
          href={`${path}?space=${s.id}`}
          aria-current={s.id === current.id ? 'page' : undefined}
          className={`flex h-10 shrink-0 items-center rounded-full px-4 text-[15px] ${
            s.id === current.id ? 'bg-ink font-semibold text-white' : 'bg-card text-ink'
          }`}
        >
          {s.name}
        </Link>
      ))}
    </nav>
  )
}

export function MonthNav({ spaceId, months, current }: { spaceId: string; months: MonthSummary[]; current: string }) {
  const years = [...new Set(months.map((m) => m.month.slice(0, 4)))]
  const currentYear = current.slice(0, 4)
  const yearMonths = months.filter((m) => m.month.startsWith(currentYear))

  return (
    <nav aria-label="Months" className="flex flex-col gap-2.5">
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none]">
        {years.map((year) => {
          const latest = months.filter((m) => m.month.startsWith(year)).at(-1)!.month
          const active = year === currentYear
          return (
            <Link
              key={year}
              href={timelineHref(spaceId, latest)}
              aria-current={active ? 'true' : undefined}
              className={`flex h-11 shrink-0 items-center rounded-full px-4 text-[16px] font-semibold ${
                active ? 'bg-cobalt text-white' : 'bg-card text-ink'
              }`}
            >
              {year}
            </Link>
          )
        })}
      </div>
      <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 [scrollbar-width:none]">
        {yearMonths.map((m) => (
          <Link
            key={m.month}
            href={timelineHref(spaceId, m.month)}
            aria-current={m.month === current ? 'page' : undefined}
            className={`flex h-11 shrink-0 items-center rounded-xl px-3 text-[15px] ${
              m.month === current ? 'bg-sunny font-extrabold text-ink' : 'text-muted'
            }`}
          >
            {monthName(m.month, 'short')}
          </Link>
        ))}
      </div>
    </nav>
  )
}

export function MonthHeader({ summary }: { summary: MonthSummary }) {
  return (
    <div className="mt-6">
      <h1 className="text-[34px] leading-none font-extrabold tracking-[-1px]">{monthName(summary.month)}</h1>
      <p className="mt-1.5 text-[15px] text-muted">
        {plural(summary.messages, 'message')}, {summary.files === 1 ? '1 photo or video' : `${count(summary.files)} photos & videos`}
      </p>
    </div>
  )
}

export function PrevNext({ spaceId, months, current }: { spaceId: string; months: MonthSummary[]; current: string }) {
  const i = months.findIndex((m) => m.month === current)
  const prev = months[i - 1]
  const next = months[i + 1]
  const linkClass = 'flex min-h-12 items-center rounded-2xl bg-card px-4 font-semibold'
  return (
    <div className="mt-10 flex justify-between gap-3">
      {prev ? <Link href={timelineHref(spaceId, prev.month)} className={linkClass}>← {monthName(prev.month)}</Link> : <span />}
      {next ? <Link href={timelineHref(spaceId, next.month)} className={linkClass}>{monthName(next.month)} →</Link> : <span />}
    </div>
  )
}

// ---------- A day ----------

export function DayView({ day, thumbs }: { day: Day; thumbs: Thumbs }) {
  const entries = withFanMail(day)
  // Each photo's position in this day's viewer, so tapping it opens at the right one
  const positions = new Map(viewerItems(day).map((v, i) => [v.key, i]))

  return (
    <section id={`d-${day.date}`} className="scroll-mt-4" aria-label={longDay(day.date)}>
      <h2 className="flex items-end gap-3">
        <span className="text-[72px] leading-[0.8] font-extrabold tracking-[-3px] text-cobalt">
          {Number(day.date.slice(8, 10))}
        </span>
        <span className="flex flex-col pb-0.5">
          <span className="text-[21px] leading-tight font-extrabold">{weekday(day.date)}</span>
          <span className="text-[15px] font-normal text-muted">{monthName(day.date.slice(0, 7))}</span>
        </span>
      </h2>
      <div className="mt-4 flex flex-col gap-5">
        {entries.map((entry) =>
          entry.type === 'fanmail' ? (
            <FanMail key={entry.key} entry={entry} />
          ) : (
            <MomentView key={entry.moment.key} moment={entry.moment} day={day.date} thumbs={thumbs} positions={positions} />
          )
        )}
      </div>
    </section>
  )
}

const targetRing = 'scroll-mt-24 rounded-lg target:ring-4 target:ring-sunny target:ring-offset-4 target:ring-offset-paper'

function MomentView({
  moment,
  day,
  thumbs,
  positions,
}: {
  moment: Moment
  day: string
  thumbs: Thumbs
  positions: Positions
}) {
  if (moment.system) {
    const block = moment.blocks[0]
    return (
      <p id={block.type === 'text' ? `m-${block.messageId}` : undefined} tabIndex={-1} className={`text-center text-[14px] text-muted ${targetRing}`}>
        {block.type === 'text' ? block.body : ''}, {moment.time}
      </p>
    )
  }
  return (
    <article className="flex flex-col gap-3">
      <p className="text-[14px] text-muted">
        <strong className="font-semibold text-ink">{moment.sender ?? 'Someone'}</strong> at {moment.time}
      </p>
      {moment.blocks.map((block, i) => (
        <BlockView key={i} block={block} day={day} thumbs={thumbs} positions={positions} />
      ))}
    </article>
  )
}

function BlockView({ block, day, thumbs, positions }: { block: Block; day: string; thumbs: Thumbs; positions: Positions }) {
  if (block.type === 'text') {
    return (
      <p id={`m-${block.messageId}`} tabIndex={-1} className={`text-[17px] leading-[1.45] break-words whitespace-pre-wrap ${targetRing}`}>
        {block.body}
        {block.edited && <span className="ml-1.5 text-[13px] text-muted">(edited)</span>}
      </p>
    )
  }
  if (block.type === 'notice') {
    return (
      <p id={`m-${block.messageId}`} tabIndex={-1} className={`text-[15px] text-muted italic ${targetRing}`}>
        {block.text}
      </p>
    )
  }
  return <Gallery items={block.items} day={day} thumbs={thumbs} positions={positions} />
}

// ---------- Photos ----------

type Placed = { item: GalleryItem; viewerIndex: number | null }
const isViewable = (item: GalleryItem) =>
  Boolean(item.attachment?.media && ['photo', 'video', 'gif', 'sticker'].includes(item.attachment.media.kind))

/**
 * Captioned photos get the full width with their words underneath; runs of
 * uncaptioned photos sit together in a grid. Every caption is kept.
 */
function Gallery({ items, day, thumbs, positions }: { items: GalleryItem[]; day: string; thumbs: Thumbs; positions: Positions }) {
  const runs: { solo: boolean; items: Placed[] }[] = []
  for (const item of items) {
    const placed: Placed = { item, viewerIndex: isViewable(item) ? positions.get(viewerKey(item)) ?? null : null }
    const solo = Boolean(item.caption) || !isViewable(item)
    const last = runs[runs.length - 1]
    if (solo || !last || last.solo) runs.push({ solo, items: [placed] })
    else last.items.push(placed)
  }

  return (
    <div className="flex flex-col gap-4">
      {runs.map((run, i) =>
        run.solo || run.items.length === 1 ? (
          <Figure key={i} placed={run.items[0]} day={day} thumbs={thumbs} />
        ) : (
          <Grid key={i} run={run.items} day={day} thumbs={thumbs} />
        )
      )}
    </div>
  )
}

function anchorFor(placed: Placed, first: boolean) {
  return first ? `m-${placed.item.messageId}` : undefined
}

function Figure({ placed, day, thumbs }: { placed: Placed; day: string; thumbs: Thumbs }) {
  const { item } = placed
  const media = item.attachment?.media
  const ratio =
    media?.width && media?.height ? Math.min(Math.max(media.width / media.height, 3 / 4), 16 / 9) : 4 / 3

  return (
    <figure id={anchorFor(placed, true)} tabIndex={-1} className={`m-0 ${targetRing}`}>
      <div className="-mx-5">
        {media?.kind === 'audio' ? (
          <div className="mx-5">
            <VoiceNote mediaId={media.id} seconds={media.durationSeconds} />
          </div>
        ) : placed.viewerIndex !== null && media ? (
          <PhotoButton day={day} index={placed.viewerIndex} label={`Open ${media.kind === 'video' ? 'video' : 'photo'}${item.caption ? `: ${item.caption}` : ''}`}>
            <Tile media={media} thumbs={thumbs} style={{ aspectRatio: String(ratio) }} />
          </PhotoButton>
        ) : (
          <div className="mx-5">
            <Missing item={item} />
          </div>
        )}
      </div>
      {item.caption && (
        <figcaption className="mt-2 text-[16px] leading-[1.4] break-words whitespace-pre-wrap">{item.caption}</figcaption>
      )}
    </figure>
  )
}

function Grid({ run, day, thumbs }: { run: Placed[]; day: string; thumbs: Thumbs }) {
  const MAX = 6
  const shown = run.length > MAX ? run.slice(0, MAX - 1) : run
  const hidden = run.length - shown.length
  const columns = run.length === 2 || run.length === 4 ? 'grid-cols-2' : 'grid-cols-3'

  return (
    <div className={`-mx-5 grid gap-[3px] ${columns}`}>
      {shown.map((p, i) => {
        const media = p.item.attachment!.media!
        const firstOfMessage = i === 0 || shown[i - 1].item.messageId !== p.item.messageId
        return (
          <div key={i} id={anchorFor(p, firstOfMessage)} tabIndex={-1} className={targetRing}>
            <PhotoButton day={day} index={p.viewerIndex!} label={`Open ${media.kind === 'video' ? 'video' : 'photo'}`}>
              <Tile media={media} thumbs={thumbs} style={{ aspectRatio: '1' }} />
            </PhotoButton>
          </div>
        )
      })}
      {hidden > 0 && (
        <PhotoButton day={day} index={run[MAX - 1].viewerIndex!} label={`Open the other ${hidden} photos`}>
          <span className="flex aspect-square flex-col items-center justify-center bg-cobalt text-white">
            <span className="text-[28px] leading-none font-extrabold">+{hidden + 1}</span>
            <span className="text-[14px]">more</span>
          </span>
        </PhotoButton>
      )}
    </div>
  )
}

function Tile({
  media,
  thumbs,
  style,
}: {
  media: NonNullable<NonNullable<GalleryItem['attachment']>['media']>
  thumbs: Thumbs
  style: React.CSSProperties
}) {
  const thumb = media.thumbPath ? thumbs[media.thumbPath] : undefined
  const isMotion = media.kind === 'video' || media.kind === 'gif'
  return (
    <span className="relative block w-full overflow-hidden bg-[#c9d3f5]" style={style}>
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumb}
          alt=""
          loading="lazy"
          className={`h-full w-full ${media.kind === 'sticker' ? 'object-contain p-3' : 'object-cover'}`}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[14px] text-muted">
          {isMotion ? 'Video' : 'Photo'}
        </span>
      )}
      {isMotion && (
        <span className="absolute right-2 bottom-2 flex h-9 w-9 items-center justify-center rounded-full bg-ink/80 text-white" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        </span>
      )}
    </span>
  )
}

function Missing({ item }: { item: GalleryItem }) {
  const text = !item.attachment
    ? `${item.omittedType === 'image' ? 'This photo' : 'This file'} wasn’t included when the chat was saved`
    : `This file wasn’t in the export: ${item.attachment.exportFilename}`
  return (
    <div className="flex min-h-28 items-center justify-center rounded-2xl border-2 border-dashed border-[#9aa3c7] p-4 text-center text-[15px] text-muted">
      {text}
    </div>
  )
}

function VoiceNote({ mediaId, seconds }: { mediaId: string; seconds: number | null }) {
  const length = seconds === null ? '' : ` (${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')})`
  return (
    <div className="rounded-2xl bg-card p-3.5">
      <p className="mb-2 flex justify-between text-[15px]">
        <span className="font-semibold">Voice note{length}</span>
        <a href={`/media/${mediaId}?download`} className="text-muted underline underline-offset-4">
          Download
        </a>
      </p>
      <audio controls preload="none" src={`/media/${mediaId}`} className="w-full" />
    </div>
  )
}

// ---------- Fan mail ----------

function FanMail({ entry }: { entry: Extract<DayEntry, { type: 'fanmail' }> }) {
  return (
    <details className="group rounded-2xl bg-card">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-3.5 py-2">
        <span aria-hidden="true" className="flex shrink-0">
          {entry.names.slice(0, 3).map((name, i) => (
            <span
              key={name}
              className={`flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 border-card text-[12px] font-extrabold text-white ${i > 0 ? '-ml-2' : ''}`}
              style={{ background: personColour(name) }}
            >
              {initials(name)}
            </span>
          ))}
        </span>
        <span className="flex-1 text-[15px] leading-snug">
          <strong>{plural(entry.messages, 'fan mail', 'fan mail')}</strong> from {listNames(entry.names)}
        </span>
        <svg className="shrink-0 transition-transform group-open:rotate-180" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <div className="flex flex-col gap-2 px-3.5 pb-3.5">
        {entry.moments.map((moment) => (
          <div key={moment.key} className="flex flex-col gap-1">
            {moment.blocks.map((block, i) => (
              <div
                key={i}
                id={block.type !== 'gallery' ? `m-${block.messageId}` : undefined}
                tabIndex={-1}
                className={`self-start max-w-[92%] rounded-[16px_16px_16px_4px] bg-paper px-3.5 py-2.5 ${targetRing}`}
              >
                {i === 0 && (
                  <p className="mb-0.5 text-[14px] font-extrabold" style={{ color: personColour(moment.sender ?? '') }}>
                    {moment.sender} <span className="font-normal text-muted">{moment.time}</span>
                  </p>
                )}
                <p className="text-[16px] leading-snug break-words whitespace-pre-wrap">
                  {block.type === 'text' ? block.body : block.type === 'notice' ? <em className="text-muted">{block.text}</em> : null}
                </p>
              </div>
            ))}
          </div>
        ))}
      </div>
    </details>
  )
}

// ---------- Search ----------

function highlight(text: string, query: string) {
  const words = query.match(/[\p{L}\p{N}]+/gu) ?? []
  if (!words.length) return text
  const pattern = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'giu')
  return text.split(pattern).map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded bg-sunny px-0.5 text-ink">
        {part}
      </mark>
    ) : (
      part
    )
  )
}

export function SearchResults({ spaceId, query, hits }: { spaceId: string; query: string; hits: SearchHit[] }) {
  return (
    <section className="mt-6" aria-live="polite">
      <p className="text-[15px] text-muted">
        {hits.length === 0
          ? `Nothing matched “${query}”. Try fewer words, or a different spelling.`
          : `${plural(hits.length, 'message')} found${hits.length === 100 ? ', showing the 100 most recent' : ''}`}
      </p>
      <ul className="mt-4 flex flex-col gap-3">
        {hits.map((hit) => (
          <li key={hit.id}>
            <Link
              href={`${timelineHref(spaceId, hit.localTime.slice(0, 7))}#m-${hit.id}`}
              className="block rounded-2xl bg-card p-4"
            >
              <p className="text-[14px] text-muted">
                <strong className="font-semibold text-ink">{hit.senderName ?? 'Group'}</strong>,{' '}
                {longDay(hit.localTime.slice(0, 10))}
              </p>
              <p className="mt-1 line-clamp-4 text-[16px] leading-snug break-words whitespace-pre-wrap">
                {highlight(hit.body, query)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
