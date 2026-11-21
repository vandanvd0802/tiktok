/**
 * Plays voice lines one after another from /api/tts. Lines are synthesised ahead (up to PREFETCH at a time)
 * while the current one plays, so there is no wait between sentences. Playback speed is applied in the
 * browser (pitch kept), like the atempo step in short-cartoon-horror.
 */
import type { SpeechOutput } from '../application/ports';

type Line = { text: string; voice: string; priority: boolean; audio?: Promise<Blob | null> };

const PREFETCH = 3;
const GAP_MS = 120;
const FETCH_TIMEOUT_MS = 20000;
const MAX_WAITING = 12; // a flood drops the oldest ordinary lines, never gift thanks

export class TtsSpeechQueue implements SpeechOutput {
  private waiting: Line[] = [];
  private playing = false;
  private rate = 1.2;
  private voice = '';
  private lastEndedAt = Date.now();
  private current: HTMLAudioElement | null = null;

  constructor(
    private readonly endpoint = '/api/tts',
    private readonly onSpeakingChange: (speaking: boolean) => void = () => {}
  ) {}

  // The voice is part of the URL, so a line cached by the browser in another voice is never replayed
  setVoice(voiceId: string) {
    this.voice = voiceId;
  }

  setRate(rate: number) {
    this.rate = rate;
    if (this.current) this.current.playbackRate = rate;
  }

  pending() {
    return this.waiting.length + (this.playing ? 1 : 0);
  }

  warm(texts: string[]) {
    fetch(`${this.endpoint}/warm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lines: texts }) })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      })
      .catch((err) => console.warn('[voice] could not ask for the warm-up:', err));
  }

  quietForMs() {
    return this.playing ? 0 : Date.now() - this.lastEndedAt;
  }

  say(text: string, priority = false) {
    const clean = text.trim();
    if (!clean) return;
    const line: Line = { text: clean, voice: this.voice, priority };
    if (priority) {
      const firstOrdinary = this.waiting.findIndex((l) => !l.priority);
      this.waiting.splice(firstOrdinary < 0 ? this.waiting.length : firstOrdinary, 0, line);
    } else {
      this.waiting.push(line);
      while (this.waiting.length > MAX_WAITING) {
        const oldest = this.waiting.findIndex((l) => !l.priority);
        if (oldest < 0) break;
        this.waiting.splice(oldest, 1);
      }
    }
    this.prefetch();
    void this.playNext();
  }

  private prefetch() {
    for (const line of this.waiting.slice(0, PREFETCH)) {
      line.audio ??= this.fetchAudio(line);
    }
  }

  private async fetchAudio({ text, voice }: Line): Promise<Blob | null> {
    try {
      const res = await fetch(`${this.endpoint}?voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.blob();
    } catch (err) {
      console.warn('[voice] could not load line, skipping:', text, err);
      return null;
    }
  }

  private async playNext() {
    if (this.playing) return;
    const line = this.waiting.shift();
    if (!line) return;
    this.playing = true;
    this.onSpeakingChange(true);
    this.prefetch();
    const blob = await (line.audio ?? this.fetchAudio(line));
    if (blob) await this.play(blob);
    this.playing = false;
    this.lastEndedAt = Date.now();
    if (!this.waiting.length) this.onSpeakingChange(false);
    setTimeout(() => void this.playNext(), GAP_MS);
  }

  private play(blob: Blob): Promise<void> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.preservesPitch = true;
      audio.playbackRate = this.rate;
      this.current = audio;
      const done = () => {
        this.current = null;
        URL.revokeObjectURL(url);
        resolve();
      };
      audio.onended = done;
      audio.onerror = done;
      audio.play().catch((err) => {
        console.warn('[voice] playback blocked:', err);
        done();
      });
    });
  }
}

/** Dashboard pages never speak (the stage page does), so the voice never doubles. */
export class SilentSpeech implements SpeechOutput {
  say() {}
  pending() {
    return 0;
  }
  quietForMs() {
    return 0;
  }
  setRate() {}
  setVoice() {}
  warm() {}
}
