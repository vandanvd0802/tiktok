/**
 * Animal skins a viewer can pick by commenting exactly one of the words below (accents, case and
 * punctuation do not matter: "Mèo", "meo", "MEO!" all give the cat).
 */
import { lettersOnly } from './keyword';

export const ANIMAL_ALIASES = {
  beaver: ['hải ly', 'hai ly', 'beaver'],
  bee: ['ong', 'bee'],
  bunny: ['thỏ', 'tho', 'bunny', 'rabbit'],
  cat: ['mèo', 'meo', 'cat'],
  caterpillar: ['sâu', 'bướm', 'caterpillar'],
  chick: ['gà', 'ga', 'chicken'],
  cow: ['bò', 'bo', 'cow'],
  crab: ['cua', 'crab'],
  deer: ['hươu', 'huou', 'deer', 'nai'],
  dog: ['chó', 'cho', 'dog'],
  elephant: ['voi', 'elephant'],
  fish: ['cá', 'ca', 'fish'],
  fox: ['cáo', 'cao', 'fox'],
  giraffe: ['hươu cao cổ', 'huou cao co'],
  hog: ['lợn rừng', 'lon rung', 'heo rung', 'hog'],
  koala: ['gấu túi', 'koala', 'gau tui'],
  lion: ['sư tử', 'lion', 'su tu'],
  monkey: ['khỉ', 'monkey', 'khi'],
  panda: ['gấu trúc', 'gau truc', 'panda'],
  parrot: ['vẹt', 'vet'],
  penguin: ['chim cánh cụt', 'chim canh cut'],
  pig: ['heo', 'pig'],
  polar: ['gấu Bắc Cực', 'gau bac cuc', 'polar bear'],
  tiger: ['hổ', 'ho', 'tiger'],
} as const;

export type AnimalId = keyof typeof ANIMAL_ALIASES;

export const ANIMAL_IDS = Object.keys(ANIMAL_ALIASES) as AnimalId[];

const BY_WORD = new Map<string, AnimalId>();
for (const id of ANIMAL_IDS) for (const alias of ANIMAL_ALIASES[id]) BY_WORD.set(lettersOnly(alias), id);

/** The animal a comment asks for, or null unless the whole comment is exactly one of the words. */
export function animalFromComment(text: string): AnimalId | null {
  return BY_WORD.get(lettersOnly(text)) ?? null;
}

export const randomAnimal = (): AnimalId => ANIMAL_IDS[Math.floor(Math.random() * ANIMAL_IDS.length)];
