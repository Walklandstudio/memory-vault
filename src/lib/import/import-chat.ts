import type { SupabaseClient } from '@supabase/supabase-js'
import type { ParseResult } from '@/lib/whatsapp/whatsapp-ios-parser'
import { chunk, toImportRow } from './rows'

export interface ExportSummary {
  chatName: string
  messages: number
  people: number
  firstDate: string | null
  lastDate: string | null
  attachmentsReferenced: number
  mediaFilesInZip: number
  attachmentsMissingFromZip: number
  omittedByWhatsApp: number
  warnings: string[]
}

/** Describe an export before importing it, so the user can check it first. */
export function summariseExport(
  parsed: ParseResult,
  mediaFileNames: Set<string>,
  fallbackName: string
): ExportSummary {
  const content = parsed.messages.filter((m) => m.kind !== 'system')
  const referenced = parsed.messages.flatMap((m) => m.attachments.map((a) => a.fileName))
  return {
    chatName: parsed.chatName ?? fallbackName,
    messages: parsed.messages.length,
    people: parsed.participants.length,
    firstDate: content[0]?.timestamp ?? null,
    lastDate: content[content.length - 1]?.timestamp ?? null,
    attachmentsReferenced: referenced.length,
    mediaFilesInZip: mediaFileNames.size,
    attachmentsMissingFromZip: referenced.filter((name) => !mediaFileNames.has(name)).length,
    omittedByWhatsApp: parsed.messages.filter((m) => m.kind === 'omitted_media').length,
    warnings: parsed.warnings,
  }
}

/**
 * Re-uses the source for this chat if it was imported (or started) before,
 * so running an import again resumes instead of duplicating.
 */
export async function findOrCreateSource(
  supabase: SupabaseClient,
  spaceId: string,
  chatName: string,
  fileName: string,
  kind: 'whatsapp_ios' | 'instagram' = 'whatsapp_ios'
): Promise<{ id: string; isNew: boolean }> {
  const { data: existing, error: findError } = await supabase
    .from('sources')
    .select('id')
    .eq('space_id', spaceId)
    .eq('kind', kind)
    .eq('chat_name', chatName)
    .order('imported_at')
    .limit(1)
  if (findError) throw new Error(`Couldn’t check for earlier imports: ${findError.message}`)
  if (existing && existing.length > 0) return { id: existing[0].id as string, isNew: false }

  const { data, error } = await supabase
    .from('sources')
    .insert({
      space_id: spaceId,
      kind,
      label: chatName,
      chat_name: chatName,
      original_filename: fileName,
    })
    .select('id')
    .single()
  if (error) throw new Error(`Couldn’t create the import record: ${error.message}`)
  return { id: data.id as string, isNew: true }
}

export interface ImportTotals {
  inserted: number
  skipped: number
  attachments: number
}

const BATCH_SIZE = 250

/** Saves every message in batches. Safe to run again: existing messages are skipped. */
export async function importMessages(
  supabase: SupabaseClient,
  sourceId: string,
  parsed: ParseResult,
  summary: ExportSummary,
  onProgress: (done: number, total: number) => void
): Promise<ImportTotals> {
  const batches = chunk(parsed.messages.map(toImportRow), BATCH_SIZE)
  const totals: ImportTotals = { inserted: 0, skipped: 0, attachments: 0 }
  let done = 0
  onProgress(0, parsed.messages.length)

  for (const batch of batches) {
    const result = await withRetry(async () => {
      const { data, error } = await supabase.rpc('import_messages', {
        p_source_id: sourceId,
        p_messages: batch,
      })
      if (error) throw new Error(error.message)
      return data as ImportTotals
    })
    totals.inserted += result.inserted
    totals.skipped += result.skipped
    totals.attachments += result.attachments
    done += batch.length
    onProgress(done, parsed.messages.length)
  }

  const { error } = await supabase
    .from('sources')
    .update({ status: 'complete', stats: { ...summary, lastImport: totals } })
    .eq('id', sourceId)
  if (error) throw new Error(`Messages saved, but couldn’t mark the import complete: ${error.message}`)

  return totals
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)))
    }
  }
  throw lastError
}
