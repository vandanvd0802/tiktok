/**
 * Background music on the stage page: the built-in house beat (ClubAudioEngine), one file from public/audio
 * on repeat, or every file there in turn. Drops in volume while the MC speaks.
 */
import { ALL_TRACKS, BUILT_IN_BEAT, type MusicOption, type StageSettings } from '../../shared/contracts';
import type { ClubAudioEngine } from './ClubAudioEngine';

const DUCK_LEVEL = 0.35;
const FADE_STEP_MS = 50;

type MusicSettings = Pick<StageSettings, 'musicOn' | 'musicVolume' | 'musicTrack'>;

export class BackgroundMusic {
  private readonly player = new Audio();
  private wanted: MusicSettings = { musicOn: false, musicVolume: 0, musicTrack: BUILT_IN_BEAT };
  private playlist: string[] = [];
  private index = 0;
  private ducked = false;
  private fadeTimer: number | null = null;

  constructor(
    private readonly beat: ClubAudioEngine,
    private readonly listTracks: () => Promise<MusicOption[]> = fetchTracks
  ) {
    this.player.addEventListener('ended', () => void this.next());
    this.player.addEventListener('error', () => {
      console.warn('[music] cannot play', this.player.src);
      if (this.wanted.musicTrack === ALL_TRACKS) setTimeout(() => void this.next(), 1000);
    });
    // Browsers block sound until the first click; LIVE Studio normally does not
    const unlock = () => {
      if (this.usesFiles() && this.player.paused && this.player.src) void this.player.play().catch(() => {});
    };
    ['click', 'keydown', 'touchstart'].forEach((e) => window.addEventListener(e, unlock));
  }

  async apply(next: MusicSettings) {
    const trackChanged = next.musicTrack !== this.wanted.musicTrack || next.musicOn !== this.wanted.musicOn;
    this.wanted = next;
    const filesOn = next.musicOn && next.musicTrack !== BUILT_IN_BEAT;
    this.beat.setMusic(next.musicOn && next.musicTrack === BUILT_IN_BEAT, next.musicVolume);
    if (!filesOn) {
      this.player.pause();
      return;
    }
    this.setLevel();
    if (!trackChanged && !this.player.paused) return;
    if (next.musicTrack === ALL_TRACKS) {
      this.playlist = (await this.listTracks()).map((t) => t.file);
      this.index = 0;
    } else {
      this.playlist = [next.musicTrack];
      this.index = 0;
    }
    this.player.loop = next.musicTrack !== ALL_TRACKS;
    this.start();
  }

  duck(on: boolean) {
    this.ducked = on;
    this.beat.duck(on);
    this.setLevel();
  }

  private usesFiles() {
    return this.wanted.musicOn && this.wanted.musicTrack !== BUILT_IN_BEAT;
  }

  private start() {
    const file = this.playlist[this.index];
    if (!file) {
      this.player.pause();
      return;
    }
    this.player.src = `/audio/${encodeURIComponent(file)}`;
    void this.player.play().catch((err) => console.warn('[music] waiting for a click to start:', err?.message ?? err));
  }

  private async next() {
    if (!this.usesFiles() || this.wanted.musicTrack !== ALL_TRACKS) return;
    this.index++;
    if (this.index >= this.playlist.length) {
      // re-read the folder each round so newly added songs join in
      this.playlist = (await this.listTracks()).map((t) => t.file);
      this.index = 0;
    }
    this.start();
  }

  // Smooth volume change (HTMLAudio has no ramp of its own)
  private setLevel() {
    const target = Math.max(0, Math.min(1, this.wanted.musicVolume * (this.ducked ? DUCK_LEVEL : 1)));
    if (this.fadeTimer !== null) clearInterval(this.fadeTimer);
    this.fadeTimer = window.setInterval(() => {
      const diff = target - this.player.volume;
      if (Math.abs(diff) < 0.02) {
        this.player.volume = target;
        clearInterval(this.fadeTimer!);
        this.fadeTimer = null;
      } else {
        this.player.volume = Math.max(0, Math.min(1, this.player.volume + Math.sign(diff) * 0.04));
      }
    }, FADE_STEP_MS);
  }
}

async function fetchTracks(): Promise<MusicOption[]> {
  try {
    const res = await fetch('/api/music');
    const body = (await res.json()) as { data?: MusicOption[] };
    return body.data ?? [];
  } catch (err) {
    console.warn('[music] cannot list public/audio:', err);
    return [];
  }
}
