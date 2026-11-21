/**
 * Cheering: during a race any viewer can comment a lane number ("1" … "8") to cheer that runner. Every
 * CHEER_GOAL cheers for one lane give its runner a short burst of speed. One viewer counts at most once
 * per CHEER_COOLDOWN_MS so a single person cannot carry a lane alone. Pure functions over immutable state.
 */
import { lettersOnly } from './keyword';

export const CHEER_GOAL = 5;
export const CHEER_BOOST_S = 2;
export const CHEER_COOLDOWN_MS = 1500;

export type CheerState = { counts: readonly number[]; meters: readonly number[] }; // per lane: total, progress to the next boost

export const emptyCheers = (lanes: number): CheerState => ({ counts: Array(lanes).fill(0), meters: Array(lanes).fill(0) });

/** The lane (0-based) a comment cheers for, or null unless the whole comment is one lane number ("3", "số 3", "lan 3"). */
export function laneFromComment(text: string, lanes: number): number | null {
  const m = /^(?:so|lan)?([1-9])$/.exec(lettersOnly(text));
  if (!m) return null;
  const lane = Number(m[1]) - 1;
  return lane < lanes ? lane : null;
}

export function addCheer(state: CheerState, lane: number): { state: CheerState; boost: boolean } {
  const meter = state.meters[lane] + 1;
  const boost = meter >= CHEER_GOAL;
  return {
    state: {
      counts: state.counts.map((c, i) => (i === lane ? c + 1 : c)),
      meters: state.meters.map((m, i) => (i === lane ? (boost ? 0 : meter) : m)),
    },
    boost,
  };
}
