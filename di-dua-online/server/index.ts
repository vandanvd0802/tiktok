/** Composition root: builds the services, wires them together and starts the HTTP server. */
import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from './config';
import { LiveRoomService } from './application/LiveRoomService';
import { SettingsService } from './application/SettingsService';
import { SpeechService } from './application/SpeechService';
import { CapCutTtsClient } from './infrastructure/capcut/CapCutTtsClient';
import { CapCutSpeechSynthesizer } from './infrastructure/capcut/CapCutSpeechSynthesizer';
import { CapCutVoiceCatalog } from './infrastructure/capcut/capcutVoices';
import { AudioFolderLibrary } from './infrastructure/storage/AudioFolderLibrary';
import { FileAudioCache } from './infrastructure/storage/FileAudioCache';
import { EdgeSpeechSynthesizer } from './infrastructure/edge/EdgeSpeechSynthesizer';
import { SseHub } from './infrastructure/sse/SseHub';
import { JsonSettingsRepository } from './infrastructure/storage/JsonSettingsRepository';
import { UploadedBackgroundStore } from './infrastructure/storage/UploadedBackgroundStore';
import { TikTokLiveGateway } from './infrastructure/tiktok/TikTokLiveGateway';
import { createApiRouter } from './http/createApiRouter';

dotenv.config();

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const config = loadConfig();
  const hub = new SseHub();

  const capcut = new CapCutTtsClient({
    baseUrl: config.tts.capcutBaseUrl,
    requestTimeoutMs: config.tts.requestTimeoutMs,
    taskTimeoutMs: config.tts.taskTimeoutMs,
    pollIntervalMs: config.tts.pollIntervalMs,
  });
  const voices = new CapCutVoiceCatalog({ voiceType: config.tts.voiceType, resourceId: config.tts.resourceId });
  const audioDir = path.join(rootDir, 'public', 'audio');
  const music = new AudioFolderLibrary(audioDir);
  const speech = new SpeechService(
    [
      new CapCutSpeechSynthesizer(capcut, voices),
      new EdgeSpeechSynthesizer(config.tts.edgeFallbackVoice, config.tts.requestTimeoutMs),
    ],
    config.tts.cacheEntries,
    config.tts.maxChars,
    new FileAudioCache(path.join(config.dataDir, 'tts-cache'), config.tts.diskCacheFiles)
  );
  const settings = new SettingsService(new JsonSettingsRepository(path.join(config.dataDir, 'settings.json')), hub, voices, music);
  const liveRoom = new LiveRoomService(new TikTokLiveGateway(), hub);
  const uploadDir = path.join(config.dataDir, 'uploads');

  const app = express();
  const httpServer = http.createServer(app);
  app.use('/assets', express.static(path.join(rootDir, 'public', 'assets')));
  app.use('/uploads', express.static(uploadDir));
  app.use('/audio', express.static(audioDir));
  app.use(
    '/api',
    createApiRouter({
      hub,
      publisher: hub,
      liveRoom,
      settings,
      speech,
      warmGapMs: config.tts.warmGapMs,
      backgrounds: new UploadedBackgroundStore(uploadDir),
      backgroundTypes: UploadedBackgroundStore.CONTENT_TYPES,
      voices,
      music,
    })
  );

  if (config.production) {
    app.use(express.static(path.join(rootDir, 'dist')));
    app.get('*', (_req, res) => res.sendFile(path.join(rootDir, 'dist', 'index.html')));
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({
      root: rootDir,
      // LIVE_MODE=1: no hot reload, so an edit never reloads the stage page mid-live.
      // Otherwise hot reload rides on this server's own port.
      server: { middlewareMode: true, hmr: config.liveMode ? false : { server: httpServer } },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(config.port, config.host, () => {
    console.log(`Đua Online đang chạy: http://localhost:${config.port}  (LIVE Studio: http://lvh.me:${config.port}/?view=stage)`);
  });
}

main().catch((err) => {
  console.error('Không khởi động được server:', err);
  process.exit(1);
});
