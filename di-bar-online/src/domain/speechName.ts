/** How a viewer's TikTok name is read aloud: plain letters only, digits spelled out, banned names become "bạn". */
import { containsBanned } from './moderation';

const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const MAX_WORDS = 5; // long nicknames slow the voice down; the first few words are enough

export function nameForSpeech(name: string): string {
  if (!name) return 'bạn';
  // Fancy letters (𝑵𝒈𝒖𝒚𝒆̂̃𝒏) become plain; emoji and symbols are dropped
  let clean = name
    .normalize('NFKC')
    .replace(/[︀-️‍⃣]/g, '')
    .replace(/[^\p{L}\p{M}\p{N}\s._-]/gu, ' ')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean || containsBanned(clean)) return 'bạn';
  clean = clean
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/(\p{L})(\d)/gu, '$1 $2')
    .replace(/(\d)(\p{L})/gu, '$1 $2')
    .replace(/[._-]+/g, ' ');
  const words = clean
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (/^\d+$/.test(w) ? w.split('').map((d) => DIGITS[Number(d)]).join(' ') : w));
  return words.slice(0, MAX_WORDS).join(' ') || 'bạn';
}

/** "A", "A và B", "A, B và C" */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} và ${names[names.length - 1]}`;
}
