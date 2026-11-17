// Browser-only: creates small preview images for the timeline.
// The original file is always kept untouched; these are extra copies.

export interface Thumbnail {
  blob: Blob
  width: number // size of the ORIGINAL picture or video
  height: number
  durationSeconds?: number
}

const MAX_SIZE = 640

function drawToJpeg(
  source: CanvasImageSource,
  width: number,
  height: number
): Promise<Blob> {
  const scale = Math.min(1, MAX_SIZE / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not available')
  ctx.fillStyle = '#ffffff' // stickers can be transparent; JPEG can't
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not create preview'))),
      'image/jpeg',
      0.82
    )
  )
}

async function imageThumbnail(file: Blob): Promise<Thumbnail> {
  const bitmap = await createImageBitmap(file)
  try {
    const blob = await drawToJpeg(bitmap, bitmap.width, bitmap.height)
    return { blob, width: bitmap.width, height: bitmap.height }
  } finally {
    bitmap.close()
  }
}

function waitFor(target: EventTarget, event: string, ms = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`Timed out waiting for ${event}`))
    }, ms)
    const onEvent = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('This video could not be read by the browser'))
    }
    const cleanup = () => {
      clearTimeout(timer)
      target.removeEventListener(event, onEvent)
      target.removeEventListener('error', onError)
    }
    target.addEventListener(event, onEvent)
    target.addEventListener('error', onError)
  })
}

async function videoThumbnail(file: Blob): Promise<Thumbnail> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  try {
    video.src = url
    await waitFor(video, 'loadeddata')
    const duration = Number.isFinite(video.duration) ? video.duration : undefined
    video.currentTime = Math.min(0.5, (duration ?? 1) / 2)
    await waitFor(video, 'seeked')
    const blob = await drawToJpeg(video, video.videoWidth, video.videoHeight)
    return { blob, width: video.videoWidth, height: video.videoHeight, durationSeconds: duration }
  } finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}

async function audioDuration(file: Blob): Promise<number | undefined> {
  const url = URL.createObjectURL(file)
  const audio = document.createElement('audio')
  audio.preload = 'metadata'
  try {
    audio.src = url
    await waitFor(audio, 'loadedmetadata')
    return Number.isFinite(audio.duration) ? audio.duration : undefined
  } catch {
    return undefined // e.g. a browser that can't play .opus voice notes
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Preview image and dimensions for a file, or null if not applicable / not possible. */
export async function browserThumbnail(
  file: Blob,
  kind: string
): Promise<Thumbnail | { durationSeconds?: number } | null> {
  try {
    if (kind === 'photo' || kind === 'sticker') return await imageThumbnail(file)
    if (kind === 'video' || kind === 'gif') return await videoThumbnail(file)
    if (kind === 'audio') return { durationSeconds: await audioDuration(file) }
  } catch {
    // A preview is a nice-to-have. The original is still uploaded.
  }
  return null
}
