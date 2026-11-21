/**
 * The waiting line for the next race. Typing the keyword joins at the back; a gift moves the giver up,
 * behind earlier gift givers only. Nobody is in the line twice. Pure functions over an immutable list.
 */
import type { Entrant } from './race';

export type QueueEntry = Entrant & { priority: boolean };

export const MAX_QUEUE = 60;

export function enqueue(queue: QueueEntry[], entrant: Entrant, priority = false): QueueEntry[] {
  const found = queue.find((q) => q.key === entrant.key);
  if (found && (found.priority || !priority)) return queue; // already waiting, nothing better to give
  const rest = queue.filter((q) => q.key !== entrant.key);
  const entry: QueueEntry = { ...entrant, avatar: entrant.avatar || found?.avatar || '', priority };
  if (!priority) return [...rest, entry].slice(0, MAX_QUEUE);
  const firstNormal = rest.findIndex((q) => !q.priority);
  const at = firstNormal < 0 ? rest.length : firstNormal;
  return [...rest.slice(0, at), entry, ...rest.slice(at)].slice(0, MAX_QUEUE);
}

/** Takes the first `count` waiting people for the next race. */
export function takeNext(queue: QueueEntry[], count: number): { taken: QueueEntry[]; rest: QueueEntry[] } {
  return { taken: queue.slice(0, count), rest: queue.slice(count) };
}

/** 1-based place in the line, or 0 when not waiting. */
export const queuePosition = (queue: QueueEntry[], key: string) => queue.findIndex((q) => q.key === key) + 1;
