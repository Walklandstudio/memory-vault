import { BlobReader, TextWriter, ZipReader, configure, type FileEntry } from '@zip.js/zip.js'
import { parseIosChat, type ParseResult } from '@/lib/whatsapp/whatsapp-ios-parser'
import { parseInstagram, type InstagramFiles } from '@/lib/instagram/instagram-parser'

configure({ useWebWorkers: false })

export type ExportKind = 'whatsapp_ios' | 'instagram'

export interface OpenedExport {
  kind: ExportKind
  parsed: ParseResult
  /** Files the messages refer to, keyed exactly as the messages name them */
  mediaFiles: Map<string, FileEntry>
  close: () => Promise<void>
}

const baseName = (path: string) => path.split('/').pop() ?? path
const isJunk = (path: string) => path.startsWith('__MACOSX/') || baseName(path).startsWith('.')

/**
 * Opens a WhatsApp or Instagram export zip and works out which it is.
 * Only the parts needed are read: for Instagram that means your posts,
 * reels, stories and username. Messages, likes and the rest are never opened.
 */
export async function openExport(
  file: Blob,
  options: { sourceId: string; timeZone: string }
): Promise<OpenedExport> {
  const reader = new ZipReader(new BlobReader(file))
  let entries
  try {
    entries = await reader.getEntries()
  } catch {
    await reader.close().catch(() => {})
    throw new Error('This file couldn’t be opened as a zip. Please choose the .zip file you downloaded.')
  }

  const files = entries.filter((e): e is FileEntry => !e.directory && !isJunk(e.filename))
  const close = () => reader.close()

  try {
    // WhatsApp: a _chat.txt with media beside it
    const chat = files.find((e) => baseName(e.filename) === '_chat.txt')
    if (chat) {
      const parsed = parseIosChat(await chat.getData(new TextWriter()), options.sourceId)
      const mediaFiles = new Map<string, FileEntry>()
      for (const e of files) if (e !== chat) mediaFiles.set(baseName(e.filename), e)
      return { kind: 'whatsapp_ios', parsed, mediaFiles, close }
    }

    // Instagram: JSON files describing posts, with photos and videos under media/
    const find = (pattern: RegExp) => files.filter((e) => pattern.test(e.filename))
    const postFiles = find(/(^|\/)your_instagram_activity\/(media|content)\/posts_\d+\.json$/)
    if (postFiles.length) {
      const readJson = async (entry?: FileEntry) =>
        entry ? JSON.parse(await entry.getData(new TextWriter())) : undefined
      const one = (pattern: RegExp) => find(pattern)[0]

      const igFiles: InstagramFiles = {
        posts: await Promise.all(postFiles.map(readJson)),
        stories: await readJson(one(/your_instagram_activity\/(media|content)\/stories\.json$/)),
        reels: await readJson(one(/your_instagram_activity\/(media|content)\/reels\.json$/)),
        archived: await readJson(one(/your_instagram_activity\/(media|content)\/archived_posts\.json$/)),
        personal: await readJson(one(/personal_information\/personal_information\.json$/)),
      }
      const parsed = parseInstagram(igFiles, options)

      // Instagram names files by their path inside the export ("media/posts/2017/123.jpg")
      const prefix = postFiles[0].filename.split('your_instagram_activity/')[0]
      const mediaFiles = new Map<string, FileEntry>()
      for (const e of files) {
        if (e.filename.startsWith(prefix + 'media/')) mediaFiles.set(e.filename.slice(prefix.length), e)
      }
      return { kind: 'instagram', parsed, mediaFiles, close }
    }
  } catch (err) {
    await close()
    throw err
  }

  await close()
  throw new Error(
    'This doesn’t look like a WhatsApp chat export or an Instagram export. ' +
      'For WhatsApp, choose the zip containing _chat.txt. For Instagram, choose the JSON export from “Download your information”.'
  )
}
