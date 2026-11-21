/** Server-sent events to every open page (stage and dashboard). */
import type { Response } from 'express';
import type { ServerEventName, ServerEvents } from '../../../shared/contracts';
import type { EventPublisher } from '../../application/ports';

const HEARTBEAT_MS = 20000;

const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

export class SseHub implements EventPublisher {
  private clients = new Set<Response>();

  publish<K extends ServerEventName>(event: K, data: ServerEvents[K]): void {
    const payload = frame(event, data);
    for (const client of this.clients) {
      try {
        client.write(payload);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  /** Opens the stream and sends the current state first so a (re)loaded page is up to date at once. */
  attach(res: Response, initial: Array<{ [K in ServerEventName]: [K, ServerEvents[K]] }[ServerEventName]>) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    for (const [event, data] of initial) res.write(frame(event, data));
    this.clients.add(res);
    const heartbeat = setInterval(() => {
      try {
        res.write(': keep-alive\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, HEARTBEAT_MS);
    res.on('close', () => {
      clearInterval(heartbeat);
      this.clients.delete(res);
    });
  }

  get size() {
    return this.clients.size;
  }
}
