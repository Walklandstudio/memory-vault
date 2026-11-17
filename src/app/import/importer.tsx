'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { parseIosChat, type ParseResult } from '@/lib/whatsapp/whatsapp-ios-parser'
import { openWhatsAppZip, type OpenedExport } from '@/lib/import/whatsapp-zip'
import {
  findOrCreateSource,
  importMessages,
  summariseExport,
  type ExportSummary,
  type ImportTotals,
} from '@/lib/import/import-chat'
import { importMedia, type MediaProgress } from '@/lib/import/import-media'
import { browserThumbnail } from '@/lib/import/thumbnails'

type Space = { id: string; name: string }

type State =
  | { step: 'choose' }
  | { step: 'reading'; fileName: string }
  | { step: 'ready'; fileName: string; parsed: ParseResult; summary: ExportSummary }
  | { step: 'messages'; summary: ExportSummary; done: number; total: number }
  | { step: 'media'; summary: ExportSummary; totals: ImportTotals; media: MediaProgress }
  | {
      step: 'finished'
      summary: ExportSummary
      totals: ImportTotals
      media: MediaProgress
      resumed: boolean
    }
  | { step: 'error'; message: string }

const formatDate = (iso: string | null) =>
  iso
    ? new Date(iso + 'Z').toLocaleDateString('en-ZA', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : '—'

const formatBytes = (bytes: number) =>
  bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : `${Math.round(bytes / 1e6)} MB`

export function Importer() {
  const [space, setSpace] = useState<Space | null>(null)
  const [spaceError, setSpaceError] = useState<string | null>(null)
  const [state, setState] = useState<State>({ step: 'choose' })
  const openZip = useRef<OpenedExport | null>(null)
  const busy = state.step === 'messages' || state.step === 'media'

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('spaces')
      .select('id, name')
      .order('created_at')
      .limit(1)
      .then(({ data, error }) => {
        if (error) setSpaceError(error.message)
        else if (!data?.length) setSpaceError('No archive is linked to your account yet.')
        else setSpace(data[0] as Space)
      })
    return () => {
      openZip.current?.close()
    }
  }, [])

  // Warn before leaving the page while an import is running.
  useEffect(() => {
    if (!busy) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [busy])

  async function handleFile(file: File) {
    await openZip.current?.close()
    openZip.current = null
    setState({ step: 'reading', fileName: file.name })
    try {
      const opened = await openWhatsAppZip(file)
      openZip.current = opened
      const parsed = parseIosChat(opened.chatText, file.name)
      if (parsed.messages.length === 0) throw new Error('No messages were found in this chat.')
      const summary = summariseExport(
        parsed,
        new Set(opened.mediaFiles.keys()),
        file.name.replace(/\.zip$/i, '')
      )
      setState({ step: 'ready', fileName: file.name, parsed, summary })
    } catch (err) {
      setState({ step: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  async function startImport(fileName: string, parsed: ParseResult, summary: ExportSummary) {
    const opened = openZip.current
    if (!space || !opened) return
    const supabase = createClient()
    const wakeLock = await keepScreenAwake()
    setState({ step: 'messages', summary, done: 0, total: parsed.messages.length })
    try {
      const source = await findOrCreateSource(supabase, space.id, summary.chatName, fileName)

      const totals = await importMessages(supabase, source.id, parsed, summary, (done, total) =>
        setState({ step: 'messages', summary, done, total })
      )

      const media = await importMedia({
        supabase,
        spaceId: space.id,
        sourceId: source.id,
        mediaFiles: opened.mediaFiles,
        makeThumbnail: browserThumbnail,
        onProgress: (media) => setState({ step: 'media', summary, totals, media }),
      })

      setState({ step: 'finished', summary, totals, media, resumed: !source.isNew })
    } catch (err) {
      setState({
        step: 'error',
        message:
          (err instanceof Error ? err.message : String(err)) +
          ' Nothing is lost: choose the same zip again and the import will continue where it stopped.',
      })
    } finally {
      wakeLock?.release().catch(() => {})
      await opened.close()
      openZip.current = null
    }
  }

  if (spaceError) return <Notice tone="error">{spaceError}</Notice>
  if (!space) return <p className="mt-8 text-sm opacity-70">Loading…</p>

  return (
    <div className="mt-8 space-y-6">
      <p className="text-sm">
        Importing into <strong>{space.name}</strong>
      </p>

      {(state.step === 'choose' || state.step === 'error' || state.step === 'finished') && (
        <label className="block cursor-pointer rounded-xl border-2 border-dashed border-current/25 p-8 text-center hover:border-current/50">
          <span className="font-medium">Choose a WhatsApp export (.zip)</span>
          <span className="mt-1 block text-sm opacity-70">Large files are fine</span>
          <input
            type="file"
            accept=".zip,application/zip"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) handleFile(file)
            }}
          />
        </label>
      )}

      {state.step === 'error' && <Notice tone="error">{state.message}</Notice>}

      {state.step === 'reading' && <p className="text-sm opacity-70">Reading {state.fileName}…</p>}

      {state.step === 'ready' && (
        <div className="space-y-4">
          <SummaryCard summary={state.summary} />
          <p className="text-sm opacity-70">
            Messages already in your archive are skipped, so it’s safe to import a chat again to
            finish an upload that stopped.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => startImport(state.fileName, state.parsed, state.summary)}
              className="rounded-lg bg-foreground px-4 py-2 font-medium text-background hover:opacity-90"
            >
              Import messages, photos & videos
            </button>
            <button
              onClick={() => setState({ step: 'choose' })}
              className="rounded-lg border border-current/25 px-4 py-2 hover:border-current/50"
            >
              Choose a different file
            </button>
          </div>
        </div>
      )}

      {state.step === 'messages' && (
        <Progress
          summary={state.summary}
          label={`Step 1 of 2 · Saving messages… ${state.done.toLocaleString()} of ${state.total.toLocaleString()}`}
          fraction={state.total ? state.done / state.total : 0}
        />
      )}

      {state.step === 'media' && (
        <Progress
          summary={state.summary}
          label={`Step 2 of 2 · Uploading photos, videos & voice notes… ${state.media.done.toLocaleString()} of ${state.media.total.toLocaleString()} (${formatBytes(state.media.uploadedBytes)})`}
          detail={state.media.current ?? undefined}
          fraction={state.media.total ? state.media.done / state.media.total : 1}
        />
      )}

      {state.step === 'finished' && <FinishedNotice state={state} />}
    </div>
  )
}

function FinishedNotice({ state }: { state: Extract<State, { step: 'finished' }> }) {
  const { summary, totals, media, resumed } = state
  const uploaded = media.done - media.missingFromZip - media.failed.length
  return (
    <Notice tone={media.failed.length ? 'error' : 'success'}>
      <p className="font-medium">“{summary.chatName}” is in your archive.</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>
          {totals.inserted.toLocaleString()} messages saved
          {totals.skipped > 0 &&
            ` (${totals.skipped.toLocaleString()} already there${resumed ? ' from an earlier import' : ''})`}
        </li>
        <li>
          {uploaded.toLocaleString()} photos, videos and voice notes uploaded and linked (
          {formatBytes(media.uploadedBytes)})
          {media.total === 0 && ' – everything was already uploaded'}
        </li>
        {media.missingFromZip > 0 && (
          <li>
            {media.missingFromZip} file{media.missingFromZip === 1 ? ' is' : 's are'} referenced in the
            chat but not included in this zip
          </li>
        )}
      </ul>
      {media.failed.length > 0 && (
        <div className="mt-3">
          <p>
            {media.failed.length} file{media.failed.length === 1 ? '' : 's'} couldn’t be uploaded.
            Choose the same zip again to retry just those. The first problem was:
          </p>
          <p className="mt-1 font-mono text-xs">
            {media.failed[0].fileName}: {media.failed[0].reason}
          </p>
        </div>
      )}
      <p className="mt-3">
        <Link href="/" className="underline">
          Back to your archive
        </Link>{' '}
        or choose another zip to import.
      </p>
    </Notice>
  )
}

function Progress({
  summary,
  label,
  detail,
  fraction,
}: {
  summary: ExportSummary
  label: string
  detail?: string
  fraction: number
}) {
  return (
    <div className="space-y-3">
      <SummaryCard summary={summary} />
      <p className="text-sm">{label}</p>
      <div className="h-2 overflow-hidden rounded-full bg-current/10">
        <div
          className="h-full bg-foreground transition-all"
          style={{ width: `${Math.round(fraction * 100)}%` }}
        />
      </div>
      {detail && <p className="truncate font-mono text-xs opacity-60">{detail}</p>}
      <p className="text-xs opacity-60">
        Keep this tab open and your Mac plugged in until it finishes. Large chats can take a while.
      </p>
    </div>
  )
}

function SummaryCard({ summary }: { summary: ExportSummary }) {
  const rows: [string, string][] = [
    ['Chat', summary.chatName],
    ['Messages', summary.messages.toLocaleString()],
    ['People', summary.people.toLocaleString()],
    ['From', formatDate(summary.firstDate)],
    ['To', formatDate(summary.lastDate)],
    ['Photos, videos & voice notes', summary.attachmentsReferenced.toLocaleString()],
  ]
  return (
    <div className="rounded-xl border border-current/20 p-5">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="opacity-70">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      {(summary.attachmentsMissingFromZip > 0 || summary.omittedByWhatsApp > 0) && (
        <p className="mt-4 text-sm opacity-80">
          {summary.omittedByWhatsApp > 0 &&
            `${summary.omittedByWhatsApp} photo${summary.omittedByWhatsApp === 1 ? ' was' : 's were'} left out by WhatsApp; their captions will still be kept. `}
          {summary.attachmentsMissingFromZip > 0 &&
            `${summary.attachmentsMissingFromZip} referenced file${summary.attachmentsMissingFromZip === 1 ? ' is' : 's are'} missing from this zip.`}
        </p>
      )}
    </div>
  )
}

function Notice({ tone, children }: { tone: 'error' | 'success'; children: React.ReactNode }) {
  const styles =
    tone === 'error' ? 'border-red-600/40 text-red-700 dark:text-red-400' : 'border-green-600/40'
  return <div className={`rounded-xl border p-5 text-sm ${styles}`}>{children}</div>
}

/** Stops the screen (and the upload) going to sleep, where the browser supports it. */
async function keepScreenAwake(): Promise<WakeLockSentinel | null> {
  try {
    return (await navigator.wakeLock?.request('screen')) ?? null
  } catch {
    return null
  }
}
