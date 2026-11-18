// Small helpers for showing dates, names and counts the same way everywhere.

const LOCALE = 'en-ZA'

/** "lisa@studiods.co.za" → "Lisa" */
export function firstNameFromEmail(email: string | undefined | null): string {
  const local = (email ?? '').split('@')[0].split(/[._+\-\d]/)[0]
  return local ? local[0].toUpperCase() + local.slice(1).toLowerCase() : ''
}

const asUtc = (iso: string) => new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso + 'Z')

/** "2026-01-14" → "Wednesday 14 January 2026" */
export const longDay = (iso: string) =>
  asUtc(iso).toLocaleDateString(LOCALE, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })

/** "2026-01-14" → "Wednesday" */
export const weekday = (iso: string) =>
  asUtc(iso).toLocaleDateString(LOCALE, { weekday: 'long', timeZone: 'UTC' })

/** "2026-01" → "January 2026"; short → "Jan" */
export const monthName = (month: string, style: 'long' | 'short' = 'long') =>
  asUtc(month + '-01').toLocaleDateString(LOCALE, {
    month: style,
    year: style === 'long' ? 'numeric' : undefined,
    timeZone: 'UTC',
  })

/** 3101 → "3 101" in en-ZA; we prefer "3,101" so use en-GB grouping */
export const count = (n: number) => n.toLocaleString('en-GB')

export const plural = (n: number, one: string, many = one + 's') =>
  `${count(n)} ${n === 1 ? one : many}`

/** "Gail, Mama Walker and Erica" */
export function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** "Mama Walker" → "MW", "Gail Fourie" → "GF", "Lisa" → "L" */
export function initials(name: string): string {
  return name
    .replace(/[^\p{L}\s]/gu, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

/** A steady colour per person, chosen from a palette that keeps white text readable */
const PERSON_COLOURS = ['#0E7A5F', '#B23A6A', '#1A2044', '#7A4CC2', '#B5530F', '#2F4BFF', '#5B6B12']
export function personColour(name: string): string {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PERSON_COLOURS[h % PERSON_COLOURS.length]
}
