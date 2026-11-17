import { BlobReader, TextWriter, ZipReader, configure, type FileEntry } from '@zip.js/zip.js'

// Decompress on the main thread using the browser's built-in decompression.
// Avoids bundling web workers and is plenty fast for our files.
configure({ useWebWorkers: false })

export interface OpenedExport {
  /** Full text of _chat.txt */
  chatText: string
  /** Every other file in the zip, by file name (photos, videos, voice notes…) */
  mediaFiles: Map<string, FileEntry>
  /** Release the zip when finished */
  close: () => Promise<void>
}

const baseName = (path: string) => path.split('/').pop() ?? path

/**
 * Opens a WhatsApp export zip without loading the whole file into memory.
 * Only the parts we ask for are read from disk.
 */
export async function openWhatsAppZip(file: Blob): Promise<OpenedExport> {
  const reader = new ZipReader(new BlobReader(file))
  let entries
  try {
    entries = await reader.getEntries()
  } catch {
    await reader.close().catch(() => {})
    throw new Error('This file couldn’t be opened as a zip. Please choose the .zip file WhatsApp created.')
  }

  const files = new Map<string, FileEntry>()
  for (const entry of entries) {
    if (entry.directory) continue
    if (entry.filename.startsWith('__MACOSX/')) continue // Mac zip clutter
    const name = baseName(entry.filename)
    if (!name || name.startsWith('.')) continue
    files.set(name, entry)
  }

  const chatEntry = files.get('_chat.txt')
  if (!chatEntry) {
    await reader.close()
    throw new Error(
      'This zip doesn’t contain a _chat.txt file. Please choose a WhatsApp chat export from an iPhone.'
    )
  }

  const chatText = await chatEntry.getData(new TextWriter())
  files.delete('_chat.txt')

  return { chatText, mediaFiles: files, close: () => reader.close() }
}
