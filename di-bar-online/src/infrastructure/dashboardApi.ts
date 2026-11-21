/** REST calls the dashboard makes to the local server. Every call throws with the server's message on failure. */
import type { MusicOption, StageCommand, StageSettings, VoiceOption } from '../../shared/contracts';

async function call(path: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(path, init);
  const body = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string; data?: unknown };
  if (!res.ok || body.success === false) throw new Error(body.error || `HTTP ${res.status}`);
  return body.data;
}

const postJson = (path: string, data: unknown = {}) =>
  call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });

export const dashboardApi = {
  connect: (username: string) => postJson('/api/tiktok/connect', { username }),
  disconnect: () => postJson('/api/tiktok/disconnect'),
  updateSettings: (patch: Partial<StageSettings>) => postJson('/api/settings', patch),
  command: (cmd: StageCommand) => postJson('/api/command', cmd),
  uploadBackground: (file: File) => call('/api/background', { method: 'POST', headers: { 'Content-Type': file.type }, body: file }),
  resetBackground: () => postJson('/api/background/reset'),
  voices: () => call('/api/voices', {}) as Promise<VoiceOption[]>,
  music: () => call('/api/music', {}) as Promise<MusicOption[]>,
};
