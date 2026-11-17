/**
 * WhatsApp iOS chat export parser (_chat.txt)
 *
 * Handles:
 *  - iOS header format: [2024/01/05, 14:32:11] Name: message
 *  - Locale date orders (YMD as on South African iPhones, DMY, MDY), auto-detected
 *  - 24h and 12h times (including the narrow no-break space iOS puts before AM/PM)
 *  - Multi-line messages
 *  - Attachments: <attached: 00000012-PHOTO-2024-01-05-14-32-11.jpg>
 *  - Media exported "without media" (image omitted, etc.)
 *  - Deleted and edited messages
 *  - System messages (group created, added, left, encryption notice)
 *  - The invisible U+200E marks iOS sprinkles through the file
 *
 * Original text is always kept in `raw` – the parser never discards source data.
 * Timestamps are LOCAL phone time with no timezone; attach one at import time.
 */

export type DateOrder = 'YMD' | 'DMY' | 'MDY';

export type AttachmentKind =
  | 'photo' | 'video' | 'audio' | 'sticker' | 'gif'
  | 'contact' | 'document' | 'other';

export interface ParsedAttachment {
  fileName: string;
  kind: AttachmentKind;
}

export type MessageKind =
  | 'text' | 'attachment' | 'system' | 'deleted' | 'omitted_media' | 'album'
  | 'unavailable'; // WhatsApp never delivered the content ("Waiting for this message")

export interface ParsedMessage {
  sourceId: string;        // which export this came from (e.g. "group-1")
  index: number;           // position within that export
  timestamp: string;       // local ISO, e.g. "2024-01-05T14:32:11"
  sender: string | null;   // null for system messages
  kind: MessageKind;
  text: string;            // cleaned text (caption for attachments)
  attachments: ParsedAttachment[];
  edited: boolean;
  omittedType: string | null; // e.g. "image" when the export left the media out
  albumId: number | null;  // photos sent together as one album share an id (the album header's index)
  raw: string;             // exact original lines, untouched
  dedupKey: string;        // stable key for spotting the same message in overlapping exports
}

export interface ParseResult {
  sourceId: string;
  chatName: string | null;     // group name as it appears in the export, if detectable
  dateOrder: DateOrder;
  dateOrderAmbiguous: boolean; // true if the file never disambiguated day vs month
  messages: ParsedMessage[];
  participants: string[];
  warnings: string[];
}

const LRM = /[\u200E\u200F\u202A-\u202E]/g;

// [date, time] rest   — date parts captured raw, order resolved later
const HEADER =
  /^[\u200E]?\[(\d{1,4})[\/.\-](\d{1,2})[\/.\-](\d{1,4}),\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:[\s\u202F\u00A0]*([AaPp])\.?\s?[Mm]\.?)?\]\s(.*)$/;

const ATTACHED = /<attached:\s*([^>]+)>/g;
const OMITTED = /(?:^|\u200E|\s)(image|video|audio|sticker|GIF|document|Contact card|video note)\s+omitted$/i;
const UNAVAILABLE = /^Waiting for this message\.?( This may take a while\.?)?$/i;
const DELETED = /^(This message was deleted\.?|You deleted this message\.?)$/i;
const EDITED = /\s*<This message was edited>\s*$/;

const SYSTEM_PATTERNS = [
  /end-to-end encrypted/i,
  /\bcreated (this )?group\b/i,
  /\badded\b/i,
  /\bremoved\b/i,
  /\bleft$/i,
  /\bjoined using\b/i,
  /\bchanged (the )?(group|subject|this group's icon|their phone number)/i,
  /\bchanged the group description\b/i,
  /\bdeleted this group's icon\b/i,
  /\bnow an admin\b/i,
  /\bsecurity code (with .+ )?changed\b/i,
  /disappearing messages/i,
];

interface RawHeader {
  a: number; b: number; c: number;
  h: number; m: number; s: number; ampm: string | null;
  rest: string;
  line: string;
}

function detectDateOrder(headers: RawHeader[]): { order: DateOrder; ambiguous: boolean } {
  let firstIsYear = false, firstOver12 = false, secondOver12 = false;
  for (const h of headers) {
    if (h.a > 31) firstIsYear = true;
    if (h.a > 12 && h.a <= 31) firstOver12 = true;
    if (h.b > 12) secondOver12 = true;
  }
  if (firstIsYear) return { order: 'YMD', ambiguous: false };
  if (firstOver12) return { order: 'DMY', ambiguous: false };
  if (secondOver12) return { order: 'MDY', ambiguous: false };
  return { order: 'DMY', ambiguous: true };
}

function pad(n: number) { return String(n).padStart(2, '0'); }

function toIso(h: RawHeader, order: DateOrder): string {
  let y: number, mo: number, d: number;
  if (order === 'YMD') { y = h.a; mo = h.b; d = h.c; }
  else if (order === 'DMY') { d = h.a; mo = h.b; y = h.c; }
  else { mo = h.a; d = h.b; y = h.c; }
  if (y < 100) y += 2000;
  let hour = h.h;
  if (h.ampm) {
    const pm = h.ampm.toLowerCase() === 'p';
    if (pm && hour < 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
  }
  return `${y}-${pad(mo)}-${pad(d)}T${pad(hour)}:${pad(h.m)}:${pad(h.s)}`;
}

export function attachmentKind(fileName: string): AttachmentKind {
  const upper = fileName.toUpperCase();
  if (upper.includes('-PHOTO-')) return 'photo';
  if (upper.includes('-VIDEO-')) return 'video';
  if (upper.includes('-AUDIO-')) return 'audio';
  if (upper.includes('-STICKER-')) return 'sticker';
  if (upper.includes('-GIF-')) return 'gif';
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'vcf') return 'contact';
  if (['jpg', 'jpeg', 'png', 'heic', 'webp'].includes(ext)) return 'photo';
  if (['mp4', 'mov', '3gp'].includes(ext)) return 'video';
  if (['opus', 'm4a', 'mp3', 'aac', 'ogg'].includes(ext)) return 'audio';
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'].includes(ext)) return 'document';
  return 'other';
}

function splitSender(rest: string): { sender: string | null; body: string } {
  // iOS writes a bare "Name:" line as the header of a photo album
  const trimmed = rest.replace(/[\s\u200E]+$/, '');
  if (trimmed.endsWith(':') && !trimmed.slice(0, -1).includes(': ')) {
    return { sender: trimmed.slice(0, -1).replace(LRM, '').trim(), body: '' };
  }
  // "Name: body" – split on the first ": " only
  const i = rest.indexOf(': ');
  if (i === -1) return { sender: null, body: rest };
  return { sender: rest.slice(0, i).replace(LRM, '').trim(), body: rest.slice(i + 2) };
}

function classify(senderRaw: string | null, bodyRaw: string, groupName: string | null) {
  const startsWithLrm = /^[\u200E]/.test(bodyRaw);
  if (senderRaw !== null && bodyRaw.trim() === '') {
    return { kind: 'album' as const, sender: senderRaw, text: '', attachments: [] as ParsedAttachment[], edited: false };
  }
  let body = bodyRaw;
  let edited = false;
  if (EDITED.test(body)) { edited = true; body = body.replace(EDITED, ''); }

  const attachments: ParsedAttachment[] = [];
  for (const m of body.matchAll(ATTACHED)) {
    const fileName = m[1].trim();
    attachments.push({ fileName, kind: attachmentKind(fileName) });
  }
  const textOnly = body.replace(ATTACHED, '').replace(LRM, '').trim();
  const omittedMatch = body.match(OMITTED);

  if (attachments.length) {
    return { kind: 'attachment' as const, sender: senderRaw, text: textOnly, attachments, edited };
  }
  if (omittedMatch) {
    // keep any caption that came before the "image omitted" marker
    const caption = body.slice(0, omittedMatch.index).replace(LRM, '').trim();
    return { kind: 'omitted_media' as const, sender: senderRaw, text: caption,
             attachments, edited, omittedType: omittedMatch[1].toLowerCase() };
  }
  if (UNAVAILABLE.test(textOnly)) {
    return { kind: 'unavailable' as const, sender: senderRaw, text: textOnly, attachments, edited };
  }
  if (DELETED.test(textOnly)) {
    return { kind: 'deleted' as const, sender: senderRaw, text: textOnly, attachments, edited };
  }
  const isSystem =
    senderRaw === null ||
    (groupName !== null && senderRaw === groupName) ||
    (startsWithLrm && SYSTEM_PATTERNS.some((p) => p.test(textOnly)));
  if (isSystem) {
    // keep the full line text for system events (e.g. "Mom added Dad")
    return { kind: 'system' as const, sender: null, text: textOnly, attachments, edited };
  }
  return { kind: 'text' as const, sender: senderRaw, text: textOnly, attachments, edited };
}

/**
 * Parse the contents of an iOS _chat.txt.
 * @param content  full text of _chat.txt
 * @param sourceId your identifier for this export (e.g. "group-1")
 */
export function parseIosChat(content: string, sourceId: string): ParseResult {
  const warnings: string[] = [];
  const text = content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');

  // Pass 1: find headers and group continuation lines
  const blocks: { header: RawHeader; extra: string[] }[] = [];
  let orphanLines = 0;
  for (const line of lines) {
    const m = line.match(HEADER);
    if (m) {
      blocks.push({
        header: {
          a: +m[1], b: +m[2], c: +m[3],
          h: +m[4], m: +m[5], s: m[6] ? +m[6] : 0,
          ampm: m[7] ?? null,
          rest: m[8],
          line,
        },
        extra: [],
      });
    } else if (blocks.length) {
      blocks[blocks.length - 1].extra.push(line);
    } else if (line.trim()) {
      orphanLines++;
    }
  }
  if (orphanLines) warnings.push(`${orphanLines} line(s) before the first message were ignored`);
  if (!blocks.length) warnings.push('No messages found – is this an iOS export?');

  const { order, ambiguous } = detectDateOrder(blocks.map((b) => b.header));
  if (ambiguous) warnings.push('Date order could not be confirmed (no day > 12 found); assumed day/month/year');

  // The first message in a group export is usually from the group itself
  // ("<Group name>: Messages and calls are end-to-end encrypted")
  let groupName: string | null = null;
  if (blocks.length) {
    const first = splitSender(blocks[0].header.rest);
    if (first.sender && (/^\u200E/.test(first.body) || /end-to-end encrypted|created group/i.test(first.body))) {
      groupName = first.sender;
    }
  }

  const participants = new Set<string>();
  const messages: ParsedMessage[] = blocks.map((b, index) => {
    // drop trailing empty lines from continuations
    while (b.extra.length && !b.extra[b.extra.length - 1].trim()) b.extra.pop();
    const { sender, body } = splitSender(b.header.rest);
    const fullBody = [body, ...b.extra].join('\n');
    const c = classify(sender, fullBody, groupName);
    const timestamp = toIso(b.header, order);
    if (c.sender) participants.add(c.sender);
    const raw = [b.header.line, ...b.extra].join('\n');
    const dedupKey = [
      // scoped to the chat, so the same event seen in two different groups is kept in both
      groupName ?? sourceId,
      timestamp,
      c.sender ?? '~system',
      c.text.replace(/\s+/g, ' '),
      // attachment *numbers* differ between exports, so key on type + embedded timestamp only
      c.attachments.map((a) => a.fileName.replace(/^\d+-/, '')).join(','),
    ].join('|');
    return {
      sourceId, index, timestamp,
      sender: c.sender, kind: c.kind, text: c.text,
      attachments: c.attachments, edited: c.edited,
      omittedType: ('omittedType' in c ? c.omittedType : null) ?? null,
      albumId: null,
      raw, dedupKey,
    };
  });

  // Number repeats within this export (e.g. several photos sent in the same second),
  // so nothing from a single export is ever treated as a duplicate. When the same chat
  // is exported twice, the nth occurrence in one export matches the nth in the other.
  const seenInSource = new Map<string, number>();
  for (const msg of messages) {
    const n = (seenInSource.get(msg.dedupKey) ?? 0) + 1;
    seenInSource.set(msg.dedupKey, n);
    msg.dedupKey = `${msg.dedupKey}#${n}`;
  }

  // Group album photos: attachments from the same sender within 2s of the previous album item
  let open: { id: number; sender: string | null; last: number } | null = null;
  for (const msg of messages) {
    const t = Date.parse(msg.timestamp + 'Z');
    if (msg.kind === 'album') {
      msg.albumId = msg.index;
      open = { id: msg.index, sender: msg.sender, last: t };
    } else if (open && msg.kind === 'attachment' && msg.sender === open.sender && t - open.last <= 2000) {
      msg.albumId = open.id;
      open.last = t;
    } else {
      open = null;
    }
  }

  const outOfOrder = messages.filter((m, i) => i > 0 && m.timestamp < messages[i - 1].timestamp);
  for (const m of outOfOrder) {
    warnings.push(`Message ${m.index} is dated ${m.timestamp}, earlier than the one before it (kept; timeline sorts by date)`);
  }

  return {
    sourceId,
    chatName: groupName,
    dateOrder: order,
    dateOrderAmbiguous: ambiguous,
    messages,
    participants: [...participants].sort(),
    warnings,
  };
}

/**
 * Merge several parsed exports into one chronological timeline,
 * dropping duplicates where exports overlap.
 */
export function mergeSources(results: ParseResult[]): ParsedMessage[] {
  const seen = new Set<string>();
  const all = results.flatMap((r) => r.messages);
  all.sort((x, y) =>
    x.timestamp.localeCompare(y.timestamp) ||
    x.sourceId.localeCompare(y.sourceId) ||
    x.index - y.index,
  );
  const out: ParsedMessage[] = [];
  for (const m of all) {
    if (seen.has(m.dedupKey)) continue;
    seen.add(m.dedupKey);
    out.push(m);
  }
  return out;
}
