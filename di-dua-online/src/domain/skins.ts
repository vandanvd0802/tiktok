/**
 * Runners are the human glb characters in public/assets/3d (character-a … character-r), picked at random
 * and never two alike in the same race.
 */
import { lettersOnly } from './keyword';

export type SkinId = `character-${string}`;

export const CHARACTER_LETTERS = 'abcdefghijklmnopqr'.split('');
export const CHARACTER_SKINS: SkinId[] = CHARACTER_LETTERS.map((l): SkinId => `character-${l}`);

/** `count` different skins in random order (repeats only when count exceeds the number of skins). */
export function pickSkins(count: number, rng: () => number = Math.random): SkinId[] {
  const pool = [...CHARACTER_SKINS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return Array.from({ length: count }, (_, i) => pool[i % pool.length]);
}

/** Commenting this word (any accents / case: "người", "Nguoi") gives the commenter's runner a new skin. */
export const RESKIN_WORD = 'nguoi';

export function isReskinComment(text: string): boolean {
  return lettersOnly(text) === RESKIN_WORD;
}

/** A random skin nobody in `taken` is wearing (any other skin if all are taken). */
export function otherSkin(current: SkinId, taken: readonly SkinId[], rng: () => number = Math.random): SkinId {
  const free = CHARACTER_SKINS.filter((s) => s !== current && !taken.includes(s));
  const pool = free.length ? free : CHARACTER_SKINS.filter((s) => s !== current);
  return pool[Math.floor(rng() * pool.length)];
}
