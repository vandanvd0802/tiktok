/** Owner settings: validates changes from the dashboard, saves them, and pushes them to every page. */
import { ALL_TRACKS, BUILT_IN_BEAT, DEFAULT_SETTINGS, type StageSettings } from '../../shared/contracts';
import type { EventPublisher, MusicLibrary, SettingsRepository, VoiceCatalog } from './ports';

export class SettingsError extends Error {}

const cleanText = (value: unknown, max: number) =>
  typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, max) : '';

const clamp = (value: unknown, min: number, max: number) => {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new SettingsError('Giá trị không hợp lệ');
  return Math.min(max, Math.max(min, n));
};

export class SettingsService {
  private settings: StageSettings;

  constructor(
    private readonly repository: SettingsRepository,
    private readonly publisher: EventPublisher,
    private readonly voices: VoiceCatalog,
    private readonly music: MusicLibrary
  ) {
    const saved = { ...DEFAULT_SETTINGS, ...repository.load() };
    // a saved voice or track that no longer exists falls back to the default
    if (!voices.has(saved.voiceId)) saved.voiceId = voices.list()[0]?.id ?? DEFAULT_SETTINGS.voiceId;
    if (!this.isTrack(saved.musicTrack)) saved.musicTrack = BUILT_IN_BEAT;
    this.settings = saved;
  }

  private isTrack(track: string) {
    return track === BUILT_IN_BEAT || track === ALL_TRACKS || this.music.has(track);
  }

  current(): StageSettings {
    return { ...this.settings };
  }

  update(patch: Record<string, unknown>): StageSettings {
    const next = { ...this.settings };
    for (const [key, value] of Object.entries(patch)) {
      switch (key) {
        case 'channelName':
          next.channelName = this.required(value, 40, 'Chưa nhập tên kênh');
          break;
        case 'keyword':
          next.keyword = this.required(value, 30, 'Chưa nhập từ khóa');
          break;
        case 'boardTitle':
          next.boardTitle = this.required(value, 24, 'Chưa nhập tên bảng');
          break;
        case 'showTopBoard':
        case 'musicOn':
          next[key] = Boolean(value);
          break;
        case 'musicVolume':
          next.musicVolume = clamp(value, 0, 1);
          break;
        case 'voiceId':
          if (typeof value !== 'string' || !this.voices.has(value)) throw new SettingsError('Không có giọng này');
          next.voiceId = value;
          break;
        case 'musicTrack':
          if (typeof value !== 'string' || !this.isTrack(value)) throw new SettingsError('Không có bài nhạc này trong public/audio');
          next.musicTrack = value;
          break;
        case 'voiceRate':
          next.voiceRate = clamp(value, 0.8, 1.6);
          break;
        default:
          throw new SettingsError(`Không có cài đặt "${key}"`);
      }
    }
    return this.commit(next);
  }

  setBackground(url: string): StageSettings {
    return this.commit({ ...this.settings, background: url });
  }

  private required(value: unknown, max: number, message: string) {
    const text = cleanText(value, max);
    if (!text) throw new SettingsError(message);
    return text;
  }

  private commit(next: StageSettings) {
    this.settings = next;
    this.repository.save(next);
    this.publisher.publish('settings', this.current());
    return this.current();
  }
}
