/**
 * Crowd members drift around their own spot instead of standing still: now and then each one picks a nearby point,
 * walks there, and dances on. The point must stay on the floor and keep a gap from everyone else, because the
 * spots are only about a metre apart.
 */
import { FLOOR, type FloorSpot } from './dancefloor';

export const WANDER_RADIUS = 0.6; // metres around the home spot
export const WANDER_MIN_MOVE = 0.3; // shorter than this is not worth a walk
export const WANDER_MIN_GAP = 0.85; // closest the walker may get to anyone else
export const WANDER_EVERY_MS = { min: 5000, max: 14000 };
const WANDER_TRIES = 10;
const EDGE_MARGIN = 0.35; // keep off the very edge of the floor, where the frame cuts people off

export function pickWanderTarget(home: FloorSpot, current: FloorSpot, others: readonly FloorSpot[], rand: () => number = Math.random): FloorSpot | null {
  for (let i = 0; i < WANDER_TRIES; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = WANDER_MIN_MOVE + rand() * (WANDER_RADIUS - WANDER_MIN_MOVE);
    const x = clamp(home.x + Math.cos(angle) * dist, -FLOOR.halfWidth + EDGE_MARGIN, FLOOR.halfWidth - EDGE_MARGIN);
    const z = clamp(home.z + Math.sin(angle) * dist, FLOOR.back + EDGE_MARGIN, FLOOR.front);
    if (Math.hypot(x - current.x, z - current.z) < WANDER_MIN_MOVE) continue;
    if (others.some((o) => Math.hypot(o.x - x, o.z - z) < WANDER_MIN_GAP)) continue;
    return { x, z };
  }
  return null;
}

export const nextWanderDelay = (rand: () => number = Math.random) => WANDER_EVERY_MS.min + rand() * (WANDER_EVERY_MS.max - WANDER_EVERY_MS.min);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
