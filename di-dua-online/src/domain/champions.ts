/**
 * VUA ĐƯỜNG ĐUA: race wins per viewer and their current winning streak. A streak grows with each race the
 * viewer runs and wins, and ends at the first race they run and lose. Bots never enter the board, but a bot
 * win still ends the streaks of the real runners it beat. Pure functions over an immutable list.
 */
import type { Entrant } from './race';

export type ChampionEntry = { key: string; name: string; avatar: string; wins: number; streak: number };

export function recordWin(board: ChampionEntry[], winner: Entrant, field: Entrant[]): ChampionEntry[] {
  const runners = new Set(field.filter((e) => !e.bot).map((e) => e.key));
  let next = board.map((e) => (runners.has(e.key) && e.key !== winner.key ? { ...e, streak: 0 } : e));
  if (!winner.bot) {
    const found = next.find((e) => e.key === winner.key);
    next = found
      ? next.map((e) => (e === found ? { ...e, name: winner.name, avatar: winner.avatar || e.avatar, wins: e.wins + 1, streak: e.streak + 1 } : e))
      : [...next, { key: winner.key, name: winner.name, avatar: winner.avatar, wins: 1, streak: 1 }];
  }
  return next.sort((a, b) => b.wins - a.wins || b.streak - a.streak);
}

export const streakOf = (board: ChampionEntry[], key: string) => board.find((e) => e.key === key)?.streak ?? 0;
