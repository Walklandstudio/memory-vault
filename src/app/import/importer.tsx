'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { parseIosChat, type ParseResult } from '@/lib/whatsapp/whatsapp-ios-parser'
import { openWhatsAppZip } from '@/lib/import/whatsapp-zip'
import {
  findOrCreateSource,
  importMessages,
  summariseExport,
  type ExportSummary,
  type ImportTotals,
} from '@/lib/import/import-chat'

type Space = { id: string; name: string }

type State =
  | { step: 'choose' }
  | { step: 'reading'; fileName: string }
  | { step: 'ready'; fileName: string; parsed: ParseResult; summary: ExportSummary }
  | { step: 'importing'; summary: ExportSummary; done: number; total: number }
  | { step: 'finished'; summary: ExportSummary; totals: ImportTotals; resumed: boolean }
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

export function Importer() {
  const [space, setSpace] = useState<Space | null>(null)
  const [spaceError, setSpaceError] = useState<string | null>(null)
  const [state, setState] = useState<State>({ step: 'choose' })

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
  }, [])

  async function handleFile(file: File) {
    setState({ step: 'reading', fileName: file.name })
    try {
      const opened = await openWhatsAppZip(file)
      const mediaNames = new Set(opened.mediaFiles.keys())
      await opened.close()
      const parsed = parseIosChat(opened.chatText, file.name)
      if (parsed.messages.length === 0) throw new Error('No messages were found in this chat.')
      const summary = summariseExport(parsed, mediaNames, file.name.replace(/\.zip$/i, ''))
      setState({ step: 'ready', fileName: file.name, parsed, summary })
    } catch (err) {
      setState({ step: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  async function startImport(fileName: string, parsed: ParseResult, summary: ExportSummary) {
    if (!space) return
    const supabase = createClient()
    setState({ step: 'importing', summary, done: 0, total: parsed.messages.length })
    try {
      const source = await findOrCreateSource(supabase, space.id, summary.chatName, fileName)
      const totals = await importMessages(supabase, source.id, parsed, summary, (done, total) =>
        setState({ step: 'importing', summary, done, total })
      )
      setState({ step: 'finished', summary, totals, resumed: !source.isNew })
    } catch (err) {
      setState({
        step: 'error',
        message:
          (err instanceof Error ? err.message : String(err)) +
          ' Nothing is lost: choose the same zip again and the import will continue where it stopped.',
      })
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

      {state.step === 'reading' && (
        <p className="text-sm opacity-70">Reading {state.fileName}…</p>
      )}

      {state.step === 'ready' && (
        <div className="space-y-4">
          <SummaryCard summary={state.summary} />
          <div className="flex gap-3">
            <button
              onClick={() => startImport(state.fileName, state.parsed, state.summary)}
              className="rounded-lg bg-foreground px-4 py-2 font-medium text-background hover:opacity-90"
            >
              Import {state.summary.messages.toLocaleString()} messages
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

      {state.step === 'importing' && (
        <div className="space-y-3">
          <SummaryCard summary={state.summary} />
          <p className="text-sm">
            Saving messages… {state.done.toLocaleString()} of {state.total.toLocaleString()}
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-current/10">
            <div
              className="h-full bg-foreground transition-all"
              style={{ width: `${state.total ? (state.done / state.total) * 100 : 0}%` }}
            />
          </div>
          <p className="text-xs opacity-60">Please keep this tab open until it finishes.</p>
        </div>
      )}

      {state.step === 'finished' && (
        <Notice tone="success">
          <p className="font-medium">“{state.summary.chatName}” is in your archive.</p>
          <p className="mt-1">
            {state.totals.inserted.toLocaleString()} messages saved
            {state.totals.skipped > 0 &&
              `, ${state.totals.skipped.toLocaleString()} already there${state.resumed ? ' from an earlier import' : ''}`}
            . {state.totals.attachments.toLocaleString()} photo and video references recorded.
          </p>
          <p className="mt-3">
            <Link href="/" className="underline">
              Back to your archive
            </Link>{' '}
            or choose another zip to import.
          </p>
        </Notice>
      )}
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
    tone === 'error'
      ? 'border-red-600/40 text-red-700 dark:text-red-400'
      : 'border-green-600/40'
  return <div className={`rounded-xl border p-5 text-sm ${styles}`}>{children}</div>
}
