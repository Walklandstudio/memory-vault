import type { SupabaseClient } from '@supabase/supabase-js'
import { BlobWriter, type FileEntry } from '@zip.js/zip.js'
import { extensionOf, kindOf, mimeTypeFor, sha256Hex, takenLocalFromFileName } from './media-files'
import type { Thumbnail } from './thumbnails'

export type MakeThumbnail = (
  file: Blob,
  kind: string
) => Promise<Thumbnail | { durationSeconds?: number } | null>

export interface MediaProgress {
  total: number
  done: number
  uploadedBytes: number
  missingFromZip: number
  failed: { fileName: string; reason: string }[]
  current: string | null
}

interface MediaRecord {
  fileName: string
  sha256: string
  kind: string
  mimeType: string
  byteSize: number
  storagePath: string
  thumbPath: string | null
  width: number | null
  height: number | null
  durationSeconds: number | null
  takenLocal: string | null
}

const BUCKET = 'media'
const PARALLEL_UPLOADS = 3
const REGISTER_EVERY = 20

/**
 * Uploads every photo, video and voice note this import still needs,
 * and links each one to its messages. Safe to run again: finished files
 * are skipped, and identical files are only stored once.
 */
export async function importMedia(options: {
  supabase: SupabaseClient
  spaceId: string
  sourceId: string
  mediaFiles: Map<string, FileEntry>
  makeThumbnail: MakeThumbnail
  onProgress: (progress: MediaProgress) => void
  /** When each file was taken, if the file name doesn't say (e.g. Instagram) */
  takenLocal?: Map<string, string>
}): Promise<MediaProgress> {
  const { supabase, spaceId, sourceId, mediaFiles, makeThumbnail, onProgress, takenLocal } = options

  const { data, error } = await supabase.rpc('pending_media', { p_source_id: sourceId })
  if (error) throw new Error(`Couldn’t check which files still need uploading: ${error.message}`)
  const pending = (data ?? []) as string[]

  const progress: MediaProgress = {
    total: pending.length,
    done: 0,
    uploadedBytes: 0,
    missingFromZip: 0,
    failed: [],
    current: null,
  }
  const report = () => onProgress({ ...progress, failed: [...progress.failed] })
  report()

  // Records are saved in small batches, one batch at a time.
  let waiting: MediaRecord[] = []
  let saving: Promise<void> = Promise.resolve()
  const save = () => {
    const batch = waiting
    waiting = []
    if (batch.length === 0) return saving
    saving = saving.then(async () => {
      try {
        await withRetry(async () => {
          const { error } = await supabase.rpc('register_media', {
            p_source_id: sourceId,
            p_items: batch,
          })
          if (error) throw new Error(error.message)
        })
      } catch (err) {
        for (const item of batch) progress.failed.push({ fileName: item.fileName, reason: errorText(err) })
        report()
      }
    })
    return saving
  }

  const queue = [...pending]
  const worker = async () => {
    for (let fileName = queue.shift(); fileName; fileName = queue.shift()) {
      progress.current = fileName
      report()
      try {
        const entry = mediaFiles.get(fileName)
        if (!entry) {
          progress.missingFromZip++
        } else {
          const record = await processFile(supabase, spaceId, fileName, entry, makeThumbnail)
          record.takenLocal ??= takenLocal?.get(fileName) ?? null
          progress.uploadedBytes += record.byteSize
          waiting.push(record)
          if (waiting.length >= REGISTER_EVERY) await save()
        }
      } catch (err) {
        progress.failed.push({ fileName, reason: errorText(err) })
      }
      progress.done++
      report()
    }
  }

  await Promise.all(Array.from({ length: PARALLEL_UPLOADS }, worker))
  await save()
  await saving
  progress.current = null
  report()
  return progress
}

async function processFile(
  supabase: SupabaseClient,
  spaceId: string,
  fileName: string,
  entry: FileEntry,
  makeThumbnail: MakeThumbnail
): Promise<MediaRecord> {
  const mimeType = mimeTypeFor(fileName)
  const kind = kindOf(fileName)
  const file = await entry.getData(new BlobWriter(mimeType))
  const sha256 = await sha256Hex(file)

  const storagePath = `${spaceId}/originals/${sha256}.${extensionOf(fileName)}`
  await uploadOnce(supabase, storagePath, file, mimeType)

  const preview = await makeThumbnail(file, kind)
  let thumbPath: string | null = null
  if (preview && 'blob' in preview) {
    thumbPath = `${spaceId}/thumbs/${sha256}.jpg`
    try {
      await uploadOnce(supabase, thumbPath, preview.blob, 'image/jpeg')
    } catch {
      thumbPath = null // the original is safe; a preview can be made later
    }
  }

  return {
    fileName,
    sha256,
    kind,
    mimeType,
    byteSize: file.size,
    storagePath,
    thumbPath,
    width: preview && 'width' in preview ? preview.width : null,
    height: preview && 'height' in preview ? preview.height : null,
    durationSeconds: preview?.durationSeconds ?? null,
    takenLocal: takenLocalFromFileName(fileName),
  }
}

/** Uploads a file unless an identical one is already stored. */
async function uploadOnce(supabase: SupabaseClient, path: string, file: Blob, contentType: string) {
  await withRetry(async () => {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType, upsert: false, cacheControl: '31536000' })
    if (error && !isAlreadyStored(error)) throw error
  })
}

function isAlreadyStored(error: unknown): boolean {
  const e = error as { status?: number; statusCode?: string; code?: string; message?: string }
  return (
    e.code === 'ResourceAlreadyExists' ||
    e.status === 409 ||
    e.statusCode === '409' ||
    /already exists|duplicate/i.test(e.message ?? '')
  )
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1500 * (i + 1)))
    }
  }
  throw lastError
}
