/**
 * Hearts from the whole room fill two meters:
 * - the party bar: every PARTY_LIKES hearts → PARTY_MS of "bùng nổ" (lasers, confetti, faster beat);
 * - the drop counter: every DROP_LIKES hearts → one beat drop where the whole floor jumps.
 * Counted from TikTok's running room total when it is sent (busy rooms drop some per-user like events).
 */

export const PARTY_LIKES = 666;
export const PARTY_MS = 60_000;
export const DROP_LIKES = 99;

export type LikeMeterState = {
  partyProgress: number; // 0..PARTY_LIKES-1
  dropProgress: number; // 0..DROP_LIKES-1
  partyUntil: number; // epoch ms
  lastRoomTotal: number | null;
};

export const INITIAL_LIKES: LikeMeterState = { partyProgress: 0, dropProgress: 0, partyUntil: 0, lastRoomTotal: null };

/** How many new hearts this like event brings, given the room total TikTok reports. */
export function newHearts(state: LikeMeterState, count: number, roomTotal: number): { hearts: number; lastRoomTotal: number | null } {
  if (roomTotal <= 0) return { hearts: count, lastRoomTotal: state.lastRoomTotal };
  const last = state.lastRoomTotal ?? roomTotal - count;
  const delta = roomTotal - last;
  return delta > 0 ? { hearts: delta, lastRoomTotal: roomTotal } : { hearts: 0, lastRoomTotal: last };
}

export type LikeOutcome = { state: LikeMeterState; partyStarted: boolean; drop: boolean };

export function addHearts(state: LikeMeterState, hearts: number, now: number): LikeOutcome {
  const partyTotal = state.partyProgress + hearts;
  const parties = Math.floor(partyTotal / PARTY_LIKES);
  const dropTotal = state.dropProgress + hearts;
  const partyWasOn = state.partyUntil > now;
  return {
    state: {
      ...state,
      partyProgress: partyTotal % PARTY_LIKES,
      dropProgress: dropTotal % DROP_LIKES,
      // More hearts during a party make it last longer
      partyUntil: parties > 0 ? Math.max(state.partyUntil, now) + parties * PARTY_MS : state.partyUntil,
    },
    partyStarted: parties > 0 && !partyWasOn,
    drop: dropTotal >= DROP_LIKES, // a burst that passes 99 several times still drops once
  };
}
