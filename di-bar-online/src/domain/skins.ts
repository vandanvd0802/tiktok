/**
 * A viewer's body is one glb in public/assets/3d, identified by its file name without extension:
 * "animal-cat", "character-d", ... Comments choose it:
 *  - an exact animal word ("meo", "panda") -> that animal (see animalSkins.ts)
 *  - "human" / "nguoi" -> a random character-* model
 *  - "thuvat" / "animal" / "dongvat" -> a random animal-* model
 */
import { ANIMAL_IDS, animalFromComment } from './animalSkins';
import { lettersOnly } from './keyword';

export type SkinId = `animal-${string}` | `character-${string}`;

export const CHARACTER_LETTERS = 'abcdefghijklmnopqr'.split('');

export const ANIMAL_SKINS: SkinId[] = ANIMAL_IDS.map((id): SkinId => `animal-${id}`);
export const CHARACTER_SKINS: SkinId[] = CHARACTER_LETTERS.map((l): SkinId => `character-${l}`);
export const ALL_SKINS: SkinId[] = [...ANIMAL_SKINS, ...CHARACTER_SKINS];

export const HUMAN_COMMAND = 'human';
export const HUMAN_COMMANDS: readonly string[] = [HUMAN_COMMAND, 'nguoi'];
export const ANIMAL_COMMANDS: readonly string[] = ['thuvat', 'animal', 'dongvat'];

export const isCharacterSkin = (skin: SkinId) => skin.startsWith('character-');

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

export const randomAnimalSkin = (): SkinId => pick(ANIMAL_SKINS);
export const randomCharacterSkin = (): SkinId => pick(CHARACTER_SKINS);

/** Starting skin of everyone who joins the floor (bots included): human or animal, an even coin flip. */
export const randomStartSkin = (): SkinId => (Math.random() < 0.5 ? randomCharacterSkin() : randomAnimalSkin());

/** The skin a comment asks for, or null unless the whole comment is exactly one command / animal word. */
export function skinFromComment(text: string): SkinId | null {
  const word = lettersOnly(text);
  if (HUMAN_COMMANDS.includes(word)) return randomCharacterSkin();
  if (ANIMAL_COMMANDS.includes(word)) return randomAnimalSkin();
  const animal = animalFromComment(text);
  return animal ? `animal-${animal}` : null;
}
