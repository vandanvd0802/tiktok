/**
 * One foot race: up to LANES runners sprint down a straight track with hurdles across it.
 * Someone who reaches a hurdle on foot either hops it (a little slower) or trips (stops for a moment).
 * Someone flying (a gift) sails over every hurdle and runs faster. Pure rules: time is the race clock in
 * seconds (negative during the countdown), randomness comes in through `rng` so tests can pin it.
 */
import { otherSkin, type SkinId } from './skins';

export const LANES = 8;
export const TRACK_LENGTH = 150; // metres
export const HURDLES: readonly number[] = [22, 40, 58, 76, 94, 112, 130];
export const COUNTDOWN_S = 3;

const SPEED = { min: 6.4, max: 7.4 }; // m/s on foot
const SPEED_WOBBLE = 0.6; // every runner speeds up and slows down a little, so the order keeps changing
const FLY_SPEED_FACTOR = 1.4;
const TURBO_SPEED_FACTOR = 1.2;
const HOP_SECONDS = 0.55;
const HOP_SPEED_FACTOR = 0.85;
const TRIP_SECONDS = 1.3;
const TRIP_SPEED = 1.2;
const HOP_CHANCE = 0.62;
const LAST_FINISH_GRACE_S = 10; // after the winner, the rest get this long before the race closes
const PHOTO_FINISH = { zone: 10, gap: 1.3 }; // the two leaders this close (m) within this far of the line (m)

export type Entrant = { key: string; name: string; avatar: string; bot: boolean };

export type Runner = Entrant & {
  lane: number;
  skin: SkinId;
  distance: number; // metres from the start line
  baseSpeed: number;
  wobblePhase: number;
  nextHurdle: number; // index into HURDLES
  hopUntil: number;
  hopStart: number;
  tripUntil: number;
  flyUntil: number;
  turboUntil: number;
  finishedAt: number | null;
  place: number | null;
};

export type RaceEvent =
  | { type: 'hop'; key: string }
  | { type: 'trip'; key: string }
  | { type: 'soar'; key: string } // flew over a hurdle
  | { type: 'finish'; key: string; place: number };

export type Rng = () => number;

export class Race {
  private readonly field: Runner[];
  private clock = -COUNTDOWN_S;
  private finishers = 0;
  private closesAt = Infinity;

  constructor(entrants: Entrant[], skins: SkinId[], private readonly rng: Rng = Math.random) {
    this.field = entrants.slice(0, LANES).map((e, i) => ({
      ...e,
      lane: i,
      skin: skins[i % skins.length],
      distance: 0,
      baseSpeed: SPEED.min + rng() * (SPEED.max - SPEED.min),
      wobblePhase: rng() * Math.PI * 2,
      nextHurdle: 0,
      hopUntil: -Infinity,
      hopStart: -Infinity,
      tripUntil: -Infinity,
      flyUntil: -Infinity,
      turboUntil: -Infinity,
      finishedAt: null,
      place: null,
    }));
  }

  get time() {
    return this.clock;
  }

  get runners(): readonly Readonly<Runner>[] {
    return this.field;
  }

  get started() {
    return this.clock >= 0;
  }

  get over() {
    return this.clock >= this.closesAt || (this.field.length > 0 && this.finishers === this.field.length);
  }

  has(key: string) {
    return this.field.some((r) => r.key === key);
  }

  isFlying(r: Readonly<Runner>) {
    return this.clock < r.flyUntil;
  }

  isTripping(r: Readonly<Runner>) {
    return this.clock < r.tripUntil;
  }

  isTurbo(r: Readonly<Runner>) {
    return this.clock < r.turboUntil;
  }

  /** The runner in a lane (0-based), if any. */
  inLane(lane: number): Readonly<Runner> | undefined {
    return this.field.find((r) => r.lane === lane);
  }

  /** Nobody home yet and the two leaders neck and neck right before the line. */
  isPhotoFinish(): boolean {
    if (this.finishers > 0 || this.field.length < 2) return false;
    const [a, b] = this.standings();
    return a.distance >= TRACK_LENGTH - PHOTO_FINISH.zone && a.distance - b.distance < PHOTO_FINISH.gap;
  }

  /** 0..1 through the current hop, or null when not hopping. */
  hopProgress(r: Readonly<Runner>): number | null {
    if (this.clock >= r.hopUntil) return null;
    return (this.clock - r.hopStart) / HOP_SECONDS;
  }

  /** The runner changes into a random skin no one else in the race wears. Returns false if they are not in it. */
  reskin(key: string): boolean {
    const r = this.field.find((x) => x.key === key);
    if (!r) return false;
    r.skin = otherSkin(r.skin, this.field.map((x) => x.skin), this.rng);
    return true;
  }

  /** A gift: the runner flies for `seconds` (added on top of any flight already going). */
  fly(key: string, seconds: number): boolean {
    const r = this.field.find((x) => x.key === key);
    if (!r || r.finishedAt !== null) return false;
    r.flyUntil = Math.max(r.flyUntil, Math.max(this.clock, 0)) + seconds;
    r.tripUntil = -Infinity; // lifted straight out of a fall
    return true;
  }

  /** A heart tap: a short burst of speed. */
  turbo(key: string, seconds: number): boolean {
    const r = this.field.find((x) => x.key === key);
    if (!r || r.finishedAt !== null) return false;
    r.turboUntil = Math.max(r.turboUntil, Math.max(this.clock, 0)) + seconds;
    return true;
  }

  /** Leaders first: finishers by place, then the rest by distance. */
  standings(): Readonly<Runner>[] {
    return [...this.field].sort((a, b) => (a.place ?? Infinity) - (b.place ?? Infinity) || b.distance - a.distance);
  }

  step(dt: number): RaceEvent[] {
    const events: RaceEvent[] = [];
    this.clock += dt;
    if (this.clock < 0) return events;
    for (const r of this.field) {
      if (r.finishedAt !== null) continue;
      r.distance += this.speed(r) * dt;
      this.crossHurdles(r, events);
      if (r.distance >= TRACK_LENGTH) {
        r.distance = TRACK_LENGTH;
        r.finishedAt = this.clock;
        r.place = ++this.finishers;
        events.push({ type: 'finish', key: r.key, place: r.place });
        if (r.place === 1) this.closesAt = this.clock + LAST_FINISH_GRACE_S;
      }
    }
    return events;
  }

  private speed(r: Runner) {
    if (this.clock < r.tripUntil) return TRIP_SPEED;
    let v = r.baseSpeed + SPEED_WOBBLE * Math.sin(this.clock * 0.9 + r.wobblePhase);
    if (this.clock < r.flyUntil) v *= FLY_SPEED_FACTOR;
    else if (this.clock < r.hopUntil) v *= HOP_SPEED_FACTOR;
    if (this.clock < r.turboUntil) v *= TURBO_SPEED_FACTOR;
    return v;
  }

  private crossHurdles(r: Runner, events: RaceEvent[]) {
    while (r.nextHurdle < HURDLES.length && r.distance >= HURDLES[r.nextHurdle]) {
      r.nextHurdle++;
      if (this.clock < r.flyUntil) {
        events.push({ type: 'soar', key: r.key });
      } else if (this.rng() < HOP_CHANCE) {
        r.hopStart = this.clock;
        r.hopUntil = this.clock + HOP_SECONDS;
        events.push({ type: 'hop', key: r.key });
      } else {
        r.tripUntil = this.clock + TRIP_SECONDS;
        events.push({ type: 'trip', key: r.key });
      }
    }
  }
}

/** Seconds of flight a gift buys, by its size. */
export const FLY_SECONDS = { small: 3, medium: 5, big: 8, huge: 12 } as const;
