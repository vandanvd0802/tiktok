/** HTTP API used by the dashboard and the stage page. Thin: validation and mapping only. */
import express, { type Request, type Response } from 'express';
import type { StageCommand } from '../../shared/contracts';
import type { BackgroundImageStore, EventPublisher, MusicLibrary, VoiceCatalog } from '../application/ports';
import type { LiveRoomService } from '../application/LiveRoomService';
import { SettingsError, type SettingsService } from '../application/SettingsService';
import type { SpeechService } from '../application/SpeechService';
import type { SseHub } from '../infrastructure/sse/SseHub';

export type ApiDeps = {
  hub: SseHub;
  publisher: EventPublisher;
  liveRoom: LiveRoomService;
  settings: SettingsService;
  speech: SpeechService;
  backgrounds: BackgroundImageStore;
  backgroundTypes: string[];
  voices: VoiceCatalog;
  music: MusicLibrary;
};

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, max) : '');

function parseCommand(body: Record<string, unknown>): StageCommand {
  switch (body.action) {
    case 'speak': {
      const text = str(body.text, 400);
      if (!text) throw new SettingsError('Chưa nhập nội dung cần đọc');
      return { action: 'speak', text };
    }
    case 'shareReminder':
    case 'drop':
      return { action: body.action };
    case 'testGift':
      return { action: 'testGift', name: str(body.name, 40) || 'Khách test', coins: Math.max(1, Math.min(30000, Number(body.coins) || 1)) };
    case 'testLike':
      return { action: 'testLike', name: str(body.name, 40) || 'Khách test', count: Math.max(1, Math.min(500, Number(body.count) || 1)) };
    case 'testComment':
      return { action: 'testComment', name: str(body.name, 40) || 'Khách test', text: str(body.text, 150) || 'quẩy' };
    default:
      throw new SettingsError('Lệnh không hợp lệ');
  }
}

const fail = (res: Response, status: number, err: unknown) =>
  res.status(status).json({ success: false, error: err instanceof Error ? err.message : String(err) });

export function createApiRouter(deps: ApiDeps) {
  const api = express.Router();
  api.use(express.json());

  api.get('/events', (_req, res) => {
    deps.hub.attach(res, [
      ['status', deps.liveRoom.current()],
      ['settings', deps.settings.current()],
    ]);
  });

  api.get('/status', (_req, res) => res.json({ success: true, data: deps.liveRoom.current() }));

  api.post('/tiktok/connect', async (req, res) => {
    try {
      await deps.liveRoom.connect(str(req.body?.username, 60));
      res.json({ success: true });
    } catch (err) {
      fail(res, 400, err);
    }
  });

  api.post('/tiktok/disconnect', (_req, res) => {
    deps.liveRoom.disconnect();
    res.json({ success: true });
  });

  api.get('/voices', (_req, res) => res.json({ success: true, data: deps.voices.list() }));
  api.get('/music', (_req, res) => res.json({ success: true, data: deps.music.list() }));

  api.get('/settings', (_req, res) => res.json({ success: true, data: deps.settings.current() }));

  api.post('/settings', (req, res) => {
    try {
      res.json({ success: true, data: deps.settings.update(req.body ?? {}) });
    } catch (err) {
      fail(res, err instanceof SettingsError ? 400 : 500, err);
    }
  });

  api.post('/command', (req, res) => {
    try {
      deps.publisher.publish('command', parseCommand(req.body ?? {}));
      res.json({ success: true, pages: deps.hub.size });
    } catch (err) {
      fail(res, 400, err);
    }
  });

  api.post('/background', express.raw({ type: deps.backgroundTypes, limit: '15mb' }), (req: Request, res: Response) => {
    const type = (req.headers['content-type'] || '').split(';')[0].trim();
    if (!deps.backgrounds.accepts(type) || !Buffer.isBuffer(req.body) || !req.body.length) {
      return fail(res, 400, new Error('Chỉ nhận ảnh JPG, PNG hoặc WebP'));
    }
    try {
      const previous = deps.settings.current().background;
      const url = deps.backgrounds.save(req.body, type);
      if (previous) deps.backgrounds.remove(previous);
      deps.settings.setBackground(url);
      res.json({ success: true, url });
    } catch (err) {
      fail(res, 500, err);
    }
  });

  api.post('/background/reset', (_req, res) => {
    try {
      const previous = deps.settings.current().background;
      if (previous) deps.backgrounds.remove(previous);
      deps.settings.setBackground('');
      res.json({ success: true });
    } catch (err) {
      fail(res, 500, err);
    }
  });

  api.get('/tts', async (req, res) => {
    const text = typeof req.query.text === 'string' ? req.query.text : '';
    if (!deps.speech.normalize(text)) return fail(res, 400, new Error('Missing text'));
    try {
      // the page names the voice it wants (so its cache is per voice); otherwise the saved one
      const asked = typeof req.query.voice === 'string' ? req.query.voice : '';
      const voice = asked && deps.voices.has(asked) ? asked : deps.settings.current().voiceId;
      const audio = await deps.speech.speak(text, voice);
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'no-store');
      res.send(audio);
    } catch (err) {
      console.error('[TTS]', err instanceof Error ? err.message : err);
      fail(res, 502, err);
    }
  });

  return api;
}
