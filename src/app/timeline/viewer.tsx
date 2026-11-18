'use client'

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ViewerItem } from '@/lib/timeline/group'

export interface ViewerPhoto extends ViewerItem {
  thumbUrl?: string
}

type Open = (day: string, index: number) => void
const ViewerContext = createContext<Open | null>(null)

/** Holds every day's photos for this month and shows the viewer when a photo is tapped. */
export function ViewerProvider({
  days,
  dayLabels,
  children,
}: {
  days: Record<string, ViewerPhoto[]>
  dayLabels: Record<string, string>
  children: React.ReactNode
}) {
  const [open, setOpen] = useState<{ day: string; index: number } | null>(null)
  const pushed = useRef(false)

  const show: Open = useCallback((day, index) => {
    // An extra history entry lets the phone's back gesture close the viewer
    window.history.pushState({ viewer: true }, '')
    pushed.current = true
    setOpen({ day, index })
  }, [])

  useEffect(() => {
    const onPop = () => {
      pushed.current = false
      setOpen(null)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const close = useCallback((thenScrollTo?: string) => {
    if (pushed.current) window.history.back()
    else setOpen(null)
    if (thenScrollTo) {
      window.setTimeout(() => {
        const el = document.getElementById(thenScrollTo)
        el?.scrollIntoView({ block: 'center' })
        el?.focus({ preventScroll: true })
      }, 80)
    }
  }, [])

  return (
    <ViewerContext.Provider value={show}>
      {children}
      {open && days[open.day] && (
        <PhotoViewer
          items={days[open.day]}
          start={open.index}
          dayLabel={dayLabels[open.day] ?? ''}
          onClose={close}
        />
      )}
    </ViewerContext.Provider>
  )
}

/** A photo or video in the timeline. Tapping it opens the full-screen viewer. */
export function PhotoButton({
  day,
  index,
  label,
  className,
  children,
}: {
  day: string
  index: number
  label: string
  className?: string
  children: React.ReactNode
}) {
  const open = useContext(ViewerContext)
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => open?.(day, index)}
      className={`block w-full cursor-zoom-in p-0 text-left ${className ?? ''}`}
    >
      {children}
    </button>
  )
}

function PhotoViewer({
  items,
  start,
  dayLabel,
  onClose,
}: {
  items: ViewerPhoto[]
  start: number
  dayLabel: string
  onClose: (thenScrollTo?: string) => void
}) {
  const [current, setCurrent] = useState(start)
  const track = useRef<HTMLDivElement>(null)
  const strip = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const item = items[current]

  // Open at the photo that was tapped
  useLayoutEffect(() => {
    const el = track.current
    if (el) el.scrollLeft = start * el.clientWidth
  }, [start])

  // Lock the page behind, and move focus into the viewer
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButton.current?.focus()
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  const goTo = useCallback((index: number) => {
    const el = track.current
    if (!el) return
    const clamped = Math.max(0, Math.min(items.length - 1, index))
    el.scrollTo({ left: clamped * el.clientWidth, behavior: 'smooth' })
  }, [items.length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') goTo(current + 1)
      if (e.key === 'ArrowLeft') goTo(current - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, goTo, onClose])

  // Keep the current thumbnail in view
  useEffect(() => {
    strip.current?.children[current]?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [current])

  const onScroll = () => {
    const el = track.current
    if (!el) return
    const index = Math.round(el.scrollLeft / el.clientWidth)
    if (index !== current) setCurrent(index)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      className="fixed inset-0 z-50 flex flex-col bg-night pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] text-white"
    >
      <div className="flex h-16 shrink-0 items-center justify-between px-2.5">
        <button
          ref={closeButton}
          type="button"
          onClick={() => onClose()}
          aria-label="Close"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-night-2"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <p className="text-[16px] font-semibold" aria-live="polite">
          {current + 1} of {items.length}
        </p>
        <span className="w-11" aria-hidden="true" />
      </div>

      <div
        ref={track}
        onScroll={onScroll}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden [scrollbar-width:none]"
      >
        {items.map((photo, i) => (
          <div key={`${photo.mediaId}-${i}`} className="flex h-full w-full shrink-0 snap-center items-center justify-center">
            {Math.abs(i - current) <= 2 ? <Slide photo={photo} active={i === current} /> : null}
          </div>
        ))}
      </div>

      <div className="shrink-0 px-5 pt-4 pb-3">
        {item.caption && <p className="text-[19px] leading-snug font-semibold">{item.caption}</p>}
        <p className="mt-1 text-[15px] text-night-muted">
          {[item.sender, `${dayLabel} at ${item.time}`].filter(Boolean).join(', ')}
        </p>
        <div className="mt-3.5 flex gap-2.5">
          <button
            type="button"
            onClick={() => onClose(`m-${item.messageId}`)}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-[14px] bg-night-2 text-[15px] font-semibold"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 5h16v11H9l-5 4z" />
            </svg>
            See the chat
          </button>
          <a
            href={`/media/${item.mediaId}?download`}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-[14px] bg-night-2 text-[15px] font-semibold"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
            </svg>
            Download
          </a>
        </div>

        {items.length > 1 && (
          <div ref={strip} className="mt-4 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]" aria-label="Photos from this day">
            {items.map((photo, i) => (
              <button
                key={`${photo.mediaId}-thumb-${i}`}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Photo ${i + 1}${i === current ? ', showing' : ''}`}
                aria-current={i === current ? 'true' : undefined}
                className={`h-12 w-12 shrink-0 overflow-hidden rounded-[10px] bg-night-2 ${
                  i === current ? 'ring-[3px] ring-sunny' : 'opacity-70'
                }`}
              >
                {photo.thumbUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Slide({ photo, active }: { photo: ViewerPhoto; active: boolean }) {
  const src = `/media/${photo.mediaId}`
  if (photo.kind === 'video' || photo.kind === 'gif') {
    const gif = photo.kind === 'gif'
    return (
      <video
        key={src}
        src={src}
        poster={photo.thumbUrl}
        controls={!gif}
        autoPlay={gif && active}
        loop={gif}
        muted={gif}
        playsInline
        preload="metadata"
        className="max-h-full max-w-full"
      />
    )
  }
  // The small preview shows instantly; the full original sharpens it once loaded
  return (
    <div
      className="flex h-full w-full items-center justify-center bg-contain bg-center bg-no-repeat"
      style={photo.thumbUrl ? { backgroundImage: `url("${photo.thumbUrl}")` } : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={photo.caption || 'Photo'}
        decoding="async"
        className="h-full w-full object-contain"
      />
    </div>
  )
}
