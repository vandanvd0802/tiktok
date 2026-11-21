/** Subscribes to the server's event stream and hands each typed event to the matching handler. */
import type { ServerEventName, ServerEvents } from '../../shared/contracts';

export type LiveEventHandlers = { [K in ServerEventName]?: (data: ServerEvents[K]) => void };

export function subscribeToLiveEvents(handlers: LiveEventHandlers, url = '/api/events'): () => void {
  const source = new EventSource(url);
  for (const name of Object.keys(handlers) as ServerEventName[]) {
    source.addEventListener(name, (e) => {
      try {
        (handlers[name] as (d: unknown) => void)(JSON.parse((e as MessageEvent).data));
      } catch (err) {
        console.error(`[events] bad "${name}" event`, err);
      }
    });
  }
  return () => source.close();
}
