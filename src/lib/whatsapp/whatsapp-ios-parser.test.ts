import { parseIosChat, mergeSources } from './whatsapp-ios-parser.ts';
import assert from 'node:assert/strict';

const L = '\u200E';

// Group 1 – South African iPhone locale (YYYY/MM/DD, 24h)
const group1 = [
  `[2019/03/14, 09:15:02] Fan Club: ${L}Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.`,
  `[2019/03/14, 09:15:02] ${L}Mom created group “Fan Club”`,
  `[2019/03/14, 09:16:40] ${L}Mom added Gran`,
  `[2019/03/14, 09:20:11] Mom: ${L}<attached: 00000003-PHOTO-2019-03-14-09-20-11.jpg>`,
  `[2019/03/14, 09:21:05] Mom: First day at school!`,
  `She didn't want to let go of my hand.`,
  `But then she ran off 😂`,
  `[2019/03/14, 10:02:33] Gran: ${L}<attached: 00000005-AUDIO-2019-03-14-10-02-33.opus>`,
  `[2019/03/15, 18:44:00] Gran: So proud 💕 <This message was edited>`,
  `[2019/03/16, 07:30:12] Uncle Pete: ${L}This message was deleted.`,
  `[2019/03/16, 07:31:00] Uncle Pete: ${L}video omitted`,
  `[2019/03/16, 07:31:30] Uncle Pete: Time: 7:31 is early for a Saturday`,
  ``,
].join('\n');

// Group 2 – a later re-export of the same group, 12h time with narrow no-break space, overlapping two messages
const group2 = [
  `[2019/03/14, 9:15:02\u202FAM] Fan Club: ${L}Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.`,
  `[2019/03/16, 7:31:30\u202FAM] Uncle Pete: Time: 7:31 is early for a Saturday`,
  `[2021/12/25, 8:05:10\u202FAM] Mom: ${L}<attached: 00000001-VIDEO-2021-12-25-08-05-10.mp4>`,
  `[2021/12/25, 12:00:00\u202FPM] Gran: Merry Christmas everyone 🎄`,
  `[2021/12/25, 12:30:00\u202FAM] Mom: midnight test`,
].join('\n');

const r1 = parseIosChat(group1, 'group-1');
const r2 = parseIosChat(group2, 'group-2');

console.log('Group 1:', r1.messages.length, 'messages; order', r1.dateOrder, '; participants', r1.participants);
console.log('Group 2:', r2.messages.length, 'messages; warnings', r2.warnings);

assert.equal(r1.dateOrder, 'YMD');
assert.deepEqual(r1.participants, ['Gran', 'Mom', 'Uncle Pete']);

const k = r1.messages.map((m) => m.kind);
assert.deepEqual(k, [
  'system', 'system', 'system', 'attachment', 'text',
  'attachment', 'text', 'deleted', 'omitted_media', 'text',
]);

const multi = r1.messages[4];
assert.equal(multi.text.split('\n').length, 3);
assert.equal(r1.messages[3].attachments[0].kind, 'photo');
assert.equal(r1.messages[5].attachments[0].kind, 'audio');
assert.equal(r1.messages[6].edited, true);
assert.equal(r1.messages[6].text, 'So proud 💕');
assert.equal(r1.messages[9].text, 'Time: 7:31 is early for a Saturday'); // colon in body survives
assert.equal(r1.messages[2].text, 'Mom added Gran');

assert.equal(r2.messages[1].timestamp, '2019-03-16T07:31:30');
assert.equal(r2.messages[3].timestamp, '2021-12-25T12:00:00'); // 12 PM
assert.equal(r2.messages[4].timestamp, '2021-12-25T00:30:00'); // 12 AM

const merged = mergeSources([r1, r2]);
assert.equal(merged.length, r1.messages.length + r2.messages.length - 2); // overlap removed
for (let i = 1; i < merged.length; i++) {
  assert.ok(merged[i - 1].timestamp <= merged[i].timestamp, 'chronological');
}

// Cases found in the real export: album headers, captioned omitted media, group-name system lines
const group3 = [
  `[23/03/2025, 10:46:56] Fans: ${L}You created group “Fans”`,
  `[03/04/2025, 09:56:49] Fans: ${L}Lisa added Gran`,
  `[20/04/2025, 16:30:21] Mom: Easter brunch crew ${L}image omitted`,
  `[23/11/2025, 12:59:29] Mom:`,
  `${L}[23/11/2025, 12:59:29] Mom: ${L}<attached: 00000391-PHOTO-2025-11-23-12-59-29.jpg>`,
  `${L}[23/11/2025, 12:59:30] Mom: ${L}<attached: 00000392-PHOTO-2025-11-23-12-59-29.jpg>`,
  `[23/11/2025, 12:59:43] Mom: Placed 3rd 50m freestyle`,
].join('\r\n');
const r3 = parseIosChat(group3, 'group-3');
assert.equal(r3.dateOrder, 'DMY');
assert.deepEqual(r3.messages.map((m) => m.kind),
  ['system', 'system', 'omitted_media', 'album', 'attachment', 'attachment', 'text']);
assert.equal(r3.messages[2].text, 'Easter brunch crew');
assert.equal(r3.messages[2].omittedType, 'image');
assert.equal(r3.messages[3].sender, 'Mom');
assert.equal(r3.messages[4].albumId, 3);
assert.equal(r3.messages[5].albumId, 3);
assert.equal(r3.messages[6].albumId, null);
assert.deepEqual(r3.participants, ['Mom']);

// Undelivered message placeholder
const r4 = parseIosChat(`[24/10/2022, 17:43:33] Gail: ${L}Waiting for this message. This may take a while.`, 'g4');
assert.equal(r4.messages[0].kind, 'unavailable');

// The same system event in two different groups is kept in both; nothing within one export is dropped
const evt = `[26/02/2026, 10:22:44] Shaun: ${L}Shaun changed their phone number to a new number.`;
const gA = parseIosChat([`[24/03/2016, 07:56:23] Old Group: ${L}You were added`, evt, `[24/03/2016, 07:56:23] Old Group: ${L}You were added`].join('\n'), 'a');
const gB = parseIosChat([`[23/03/2025, 10:46:56] New Group: ${L}You created group “New Group”`, evt].join('\n'), 'b');
assert.equal(gA.chatName, 'Old Group');
const m2 = mergeSources([gA, gB]);
assert.equal(m2.filter((m) => m.text.includes('phone number')).length, 2);
assert.equal(m2.filter((m) => m.text === 'You were added').length, 2);

// Several photos sent in the same second are all kept, and a re-export of the same chat merges cleanly
const burst = [
  `[23/03/2025, 10:46:56] Fans: ${L}You created group “Fans”`,
  `[03/04/2025, 09:58:34] Mom: ${L}<attached: 00000008-PHOTO-2025-04-03-09-58-33.jpg>`,
  `[03/04/2025, 09:58:34] Mom: ${L}<attached: 00000009-PHOTO-2025-04-03-09-58-33.jpg>`,
].join('\n');
const reExport = burst.replace('00000008', '00000101').replace('00000009', '00000102');
const once = parseIosChat(burst, 'x');
assert.equal(mergeSources([once]).length, 3);
assert.equal(mergeSources([once, parseIosChat(reExport, 'y')]).length, 3);

// raw is preserved exactly
assert.ok(r1.messages[4].raw.includes("She didn't want to let go"));

console.log('Merged timeline:', merged.length, 'messages');
console.log('All tests passed ✓');
