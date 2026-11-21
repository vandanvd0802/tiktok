/**
 * CapCut text-to-speech over HTTP: create a task, poll until it is done, download the MP3.
 * Unofficial API (same calls as the `capcut-tts-api` Python SDK); it can change or break at any time.
 */
import crypto from 'crypto';
import { baseHeaders, CapCutDevice, commonQuery, createDevice, escapeXml, signHeader, ttsPayloadSign } from './capcutSigning';

export type CapCutVoice = { voiceType: string; resourceId: string };
export type CapCutClientOptions = {
  baseUrl: string;
  requestTimeoutMs: number;
  taskTimeoutMs: number;
  pollIntervalMs: number;
};

type TaskRef = { id: string; token: string; bindId: string };
type ApiResponse = { ret?: number | string; errmsg?: string; data?: { bind_id?: string; tasks?: Array<Record<string, unknown>> } };

const SUCCESS = new Set(['success', 'succeed', 'succeeded', 'completed', 'done']);
const BABI = {
  feature_entrance: 'editor',
  feature_entrance_detail: 'editor-feature-text_to_speech',
  feature_key: 'text_to_speech',
  scenario: 'video_editor',
};

export class CapCutError extends Error {}

export class CapCutTtsClient {
  private readonly device: CapCutDevice = createDevice();

  constructor(private readonly options: CapCutClientOptions) {}

  async synthesize(text: string, voice: CapCutVoice): Promise<Buffer> {
    const task = await this.createTask(text, voice);
    const payload = await this.waitForTask(task);
    return this.download(payload);
  }

  private async createTask(text: string, voice: CapCutVoice): Promise<TaskRef> {
    const ssml =
      '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">\n' +
      `    <voice name="${escapeXml(voice.voiceType)}" mock_tone_info="" platform="sami" ` +
      `resource_id="${escapeXml(voice.resourceId)}" emotion="" emotion_scale="0" style="" role="" ` +
      'moyin_emotion="" is_clone_tone="false" need_subtitle_timestamp="false">\n' +
      `        <prosody rate="1.0">${escapeXml(text)}</prosody>\n` +
      '    </voice>\n</speak>';
    const extraInfo = JSON.stringify({ benefit_info: {} });
    const payload = {
      audio_format: 'mp3',
      babi_param: JSON.stringify(BABI),
      credit_disable: false,
      extra_info: extraInfo,
      need_merge_voice: false,
      need_subtitle_timestamp: false,
      scene: 'text_to_speech',
      ssml,
      sign: ttsPayloadSign(ssml, extraInfo, this.device),
    };
    const body = {
      bind_id: crypto.randomUUID(),
      can_queue: true,
      enter_from: 'text_to_speech',
      tasks: [{ context: crypto.randomUUID(), payload: JSON.stringify(payload), req_key: 'sami_text_to_speech', task_version: 'v3' }],
    };
    const res = await this.post('/lv/v1/common_task/new', commonQuery(this.device, BABI, true), body);
    const task = res.data?.tasks?.[0];
    if (!task?.id || !task.token) throw new CapCutError(`CapCut returned no task: ${JSON.stringify(res).slice(0, 300)}`);
    return { id: String(task.id), token: String(task.token), bindId: String(task.bind_id ?? res.data?.bind_id ?? '') };
  }

  private async waitForTask(task: TaskRef): Promise<unknown> {
    const deadline = Date.now() + this.options.taskTimeoutMs;
    const body = { tasks: [{ bind_id: task.bindId, id: task.id, req_key: 'sami_text_to_speech', task_version: 'v3', token: task.token }] };
    while (Date.now() < deadline) {
      const res = await this.post('/lv/v1/common_task/query', commonQuery(this.device, undefined, false), body);
      const t = res.data?.tasks?.[0];
      const status = String(t?.status ?? '').toLowerCase();
      if (SUCCESS.has(status)) return typeof t?.payload === 'string' ? JSON.parse(t.payload) : t?.payload;
      if (status === 'failed') throw new CapCutError(`CapCut task failed: ${JSON.stringify(t).slice(0, 300)}`);
      await new Promise((r) => setTimeout(r, this.options.pollIntervalMs));
    }
    throw new CapCutError(`CapCut task timed out after ${this.options.taskTimeoutMs} ms`);
  }

  private async download(payload: unknown): Promise<Buffer> {
    const items = (payload as { audio_subtitles?: Array<Record<string, unknown>> })?.audio_subtitles ?? [];
    const first = items[0] ?? {};
    const url = ['speech_url', 'audio_url', 'url'].map((k) => first[k]).find((v): v is string => typeof v === 'string' && !!v);
    if (!url) throw new CapCutError('CapCut result has no audio URL');
    const res = await fetch(url, { signal: AbortSignal.timeout(this.options.requestTimeoutMs) });
    if (!res.ok) throw new CapCutError(`CapCut audio download HTTP ${res.status}`);
    const audio = Buffer.from(await res.arrayBuffer());
    if (!audio.length) throw new CapCutError('CapCut audio download was empty');
    return audio;
  }

  private async post(path: string, query: Record<string, string>, bodyObj: unknown): Promise<ApiResponse> {
    const body = JSON.stringify(bodyObj);
    const url = `${this.options.baseUrl}${path}?${new URLSearchParams(query)}`;
    const headers = baseHeaders(this.device, body, true);
    headers.sign = signHeader(url, this.device, headers['device-time']);
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(this.options.requestTimeoutMs),
    });
    const text = await res.text();
    let data: ApiResponse;
    try {
      data = JSON.parse(text);
    } catch {
      throw new CapCutError(`CapCut ${path} returned non-JSON HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    if (res.status >= 400) throw new CapCutError(`CapCut ${path} HTTP ${res.status}: ${text.slice(0, 200)}`);
    if (data.ret !== undefined && data.ret !== 0 && data.ret !== '0' && data.ret !== '') {
      throw new CapCutError(`CapCut ${path} ret=${data.ret}: ${data.errmsg ?? ''}`);
    }
    return data;
  }
}
