/** TOP DONATE: total gift coins per viewer, biggest first. Pure functions over an immutable list. */

export type LeaderEntry = { key: string; name: string; avatar: string; coins: number };

export const viewerKey = (name: string) => name.trim().toLowerCase();

export function addDonation(board: LeaderEntry[], name: string, coins: number, avatar = ''): LeaderEntry[] {
  if (coins <= 0) return board;
  const key = viewerKey(name);
  const found = board.find((e) => e.key === key);
  const next = found
    ? board.map((e) => (e === found ? { ...e, coins: e.coins + coins, avatar: avatar || e.avatar } : e))
    : [...board, { key, name, avatar, coins }];
  return next.sort((a, b) => b.coins - a.coins);
}
