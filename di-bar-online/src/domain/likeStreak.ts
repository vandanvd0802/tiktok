/**
 * A viewer who taps the heart LIKES_FOR_STAGE times in a row goes up on the stage (now 1: the first heart).
 * "In a row" = every tap comes within STREAK_GAP_MS of the previous one; a longer pause starts counting again.
 */

export const LIKES_FOR_STAGE = 1;
export const STREAK_GAP_MS = 3000;

export type LikeStreaks = ReadonlyMap<string, { count: number; lastAt: number }>;

export type StreakOutcome = { streaks: LikeStreaks; reached: boolean };

export function addLikes(streaks: LikeStreaks, key: string, taps: number, now: number): StreakOutcome {
  const prev = streaks.get(key);
  const continuing = prev !== undefined && now - prev.lastAt <= STREAK_GAP_MS;
  const count = (continuing ? prev.count : 0) + Math.max(1, taps);
  const reached = count >= LIKES_FOR_STAGE;
  const next = new Map(streaks);
  if (reached) next.delete(key); // another full streak is needed for the next call
  else next.set(key, { count, lastAt: now });
  return { streaks: next, reached };
}
