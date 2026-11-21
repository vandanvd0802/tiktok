/** Everything the server reads from the environment, with defaults, in one place. */
import path from 'path';

export type ServerConfig = {
  port: number;
  host: string;
  liveMode: boolean; // BAT-LIVE.bat: no hot reload, so the stage page never reloads mid-live
  production: boolean;
  dataDir: string; // settings.json and uploads/ live here
  tts: {
    capcutBaseUrl: string;
    voiceType: string;
    resourceId: string;
    requestTimeoutMs: number;
    taskTimeoutMs: number;
    pollIntervalMs: number;
    cacheEntries: number;
    maxChars: number;
    edgeFallbackVoice: string; // used only when CapCut fails
  };
};

const num = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && value !== '' && value !== undefined ? n : fallback;
};

export function loadConfig(env = process.env): ServerConfig {
  return {
    port: num(env.PORT, 3000),
    // Loopback only: the API has no login, and /api/control can make the live voice say anything
    host: env.HOST || '127.0.0.1',
    liveMode: env.LIVE_MODE === '1',
    production: env.NODE_ENV === 'production',
    dataDir: path.resolve(env.DATA_DIR || process.cwd()),
    tts: {
      capcutBaseUrl: (env.CAPCUT_BASE_URL || 'https://editor-api-sg.capcutapi.com').replace(/\/+$/, ''),
      // Default MC voice before one is picked on the dashboard: the "narrator" of short-cartoon-horror
      voiceType: env.CAPCUT_VOICE || 'BV075_streaming',
      resourceId: env.CAPCUT_RESOURCE_ID || '7102355803792740865',
      requestTimeoutMs: num(env.CAPCUT_REQUEST_TIMEOUT_MS, 15000),
      taskTimeoutMs: num(env.CAPCUT_TASK_TIMEOUT_MS, 30000),
      pollIntervalMs: num(env.CAPCUT_POLL_MS, 250),
      cacheEntries: num(env.TTS_CACHE_ENTRIES, 300),
      maxChars: num(env.TTS_MAX_CHARS, 400),
      edgeFallbackVoice: env.EDGE_FALLBACK_VOICE || 'vi-VN-NamMinhNeural',
    },
  };
}
