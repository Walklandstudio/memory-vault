import { attachmentKind, type AttachmentKind } from '@/lib/whatsapp/whatsapp-ios-parser'

const MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  '3gp': 'video/3gpp',
  opus: 'audio/ogg',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  aac: 'audio/aac',
  vcf: 'text/vcard',
  pdf: 'application/pdf',
  txt: 'text/plain',
}

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot === -1 ? 'bin' : fileName.slice(dot + 1).toLowerCase()
}

export function mimeTypeFor(fileName: string): string {
  return MIME_TYPES[extensionOf(fileName)] ?? 'application/octet-stream'
}

export function kindOf(fileName: string): AttachmentKind {
  return attachmentKind(fileName)
}

/**
 * WhatsApp names files like 00000007-PHOTO-2025-04-03-09-58-33.jpg.
 * Returns the local time in the name ("2025-04-03T09:58:33"), or null.
 */
export function takenLocalFromFileName(fileName: string): string | null {
  const m = fileName.match(/-(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})\.[^.]+$/)
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : null
}

/** A fingerprint of the file's exact contents. Identical files get identical fingerprints. */
export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
