/**
 * Who is on the dance floor and where. Spots are fixed positions in floor coordinates (metres, x across,
 * z toward the camera); spot 0 is near the middle and spots fill outward. When the floor is full, the person
 * quiet the longest gives up their spot (TikTok never says when a viewer leaves).
 */

import { randomStartSkin, type SkinId } from './skins';

export type FloorSpot = { x: number; z: number };

export type Clubber = {
  key: string;
  name: string;
  avatar: string;
  spot: number;
  outfit: number; // index into the outfit palette (the DJ's human outfit)
  skin: SkinId; // which model this viewer shows as (random human or animal at first, a comment can change it)
  bot: boolean; // filler dancer so the floor is never empty: no name, never on stage, leaves when real people come
  joinedAt: number;
  lastActive: number;
};

/** Fewer than this many real people in the room: bots fill the floor up to it. */
export const MIN_CROWD = 12;

export const FLOOR = { halfWidth: 3.2, back: -3.4, front: 2.2 } as const;

// Deterministic pseudo-random so the crowd looks the same on every reload
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Closest two standing spots may be (metres): the animals are about a metre wide and dance in place. */
export const MIN_SPOT_GAP = 1.05;
const WALK_LANE = 0.75; // half-width of the free lane down the middle, so people can walk up to the stage
const SPOT_TRIES = 4000;
const SPOT_HALF_WIDTH = 2.55; // narrower than the floor: animals at the very edge get cut off by the frame

function buildSpots(): FloorSpot[] {
  const rand = seeded(20261114);
  const spots: FloorSpot[] = [];
  const zMin = FLOOR.back + 0.6;
  for (let i = 0; i < SPOT_TRIES; i++) {
    const x = -SPOT_HALF_WIDTH + rand() * SPOT_HALF_WIDTH * 2;
    const z = zMin + rand() * (FLOOR.front - zMin);
    if (Math.abs(x) < WALK_LANE) continue;
    if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < MIN_SPOT_GAP)) continue;
    spots.push({ x, z });
  }
  // middle-front first: those are the best seen
  return spots.sort((a, b) => Math.hypot(a.x * 0.8, a.z - 0.5) - Math.hypot(b.x * 0.8, b.z - 0.5));
}

export const SPOTS: readonly FloorSpot[] = buildSpots();
export const OUTFIT_COUNT = 10;

export function pickSpot(crowd: Clubber[]): { spot: number; evict?: Clubber } {
  const taken = new Set(crowd.map((c) => c.spot));
  for (let spot = 0; spot < SPOTS.length; spot++) if (!taken.has(spot)) return { spot };
  const real = crowd.filter((c) => !c.bot);
  const evict = (real.length ? real : crowd).reduce((a, b) => (b.lastActive < a.lastActive ? b : a));
  return { spot: evict.spot, evict };
}

/** Adds a newcomer (or refreshes someone already there). */
export function upsertClubber(crowd: Clubber[], name: string, avatar: string, now: number, key = name.trim().toLowerCase()): Clubber[] {
  const found = crowd.find((c) => c.key === key);
  if (found) return crowd.map((c) => (c === found ? { ...c, lastActive: now, avatar: avatar || c.avatar } : c));
  // A real person takes a bot's place first; only when no bot is left does the usual seat rule apply
  const bot = crowd.find((c) => c.bot);
  const { spot, evict } = bot ? { spot: bot.spot, evict: bot } : pickSpot(crowd);
  const clubber: Clubber = { key, name, avatar, spot, outfit: Math.floor(Math.random() * OUTFIT_COUNT), skin: randomStartSkin(), joinedAt: now, lastActive: now, bot: false };
  return [...crowd.filter((c) => c !== evict), clubber];
}

let botSeq = 0;

/**
 * Keeps the floor at MIN_CROWD: bots make up the difference to the number of real people, and surplus bots
 * leave. With MIN_CROWD or more real people there are no bots at all.
 */
export function balanceBots(crowd: Clubber[], now: number): Clubber[] {
  const real = crowd.filter((c) => !c.bot).length;
  const bots = crowd.filter((c) => c.bot);
  const wanted = Math.max(0, MIN_CROWD - real);
  if (bots.length > wanted) {
    const leaving = new Set(bots.slice(wanted)); // keep the earliest bots
    return crowd.filter((c) => !leaving.has(c));
  }
  let next = crowd;
  for (let i = bots.length; i < wanted; i++) {
    const { spot } = pickSpot(next);
    next = [...next, { key: `bot-${++botSeq}`, name: '', avatar: '', spot, outfit: Math.floor(Math.random() * OUTFIT_COUNT), skin: randomStartSkin(), joinedAt: now, lastActive: now, bot: true }];
  }
  return next;
}

export const realCount = (crowd: Clubber[]) => crowd.filter((c) => !c.bot).length;

/** Gives one person a new skin (no change if they are not on the floor or already have it). */
export function setSkin(crowd: Clubber[], key: string, skin: SkinId): Clubber[] {
  return crowd.map((c) => (c.key === key && c.skin !== skin ? { ...c, skin } : c));
}
