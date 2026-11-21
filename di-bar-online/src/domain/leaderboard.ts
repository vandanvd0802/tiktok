/** TOP board: 1 point per comment, POINTS_PER_COIN per gift coin. Pure functions over an immutable list. */

export const POINTS_PER_COMMENT = 1;
export const POINTS_PER_COIN = 10;

export type LeaderEntry = { key: string; name: string; avatar: string; points: number; coins: number };

export const viewerKey = (name: string) => name.trim().toLowerCase();

export function addPoints(board: LeaderEntry[], name: string, points: number, avatar = '', coins = 0): LeaderEntry[] {
  const key = viewerKey(name);
  const found = board.find((e) => e.key === key);
  const next = found
    ? board.map((e) =>
        e === found ? { ...e, points: e.points + points, coins: e.coins + coins, avatar: avatar || e.avatar } : e
      )
    : [...board, { key, name, avatar, points, coins }];
  return next.sort((a, b) => b.points - a.points);
}
