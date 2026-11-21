/** What the application layer needs from the outside world (implemented in src/infrastructure). */
import type { GiftTier } from '../domain/gifts';

export interface SpeechOutput {
  /** priority lines (gift thanks, "Đọc ngay") go before everything else still waiting */
  say(text: string, priority?: boolean): void;
  pending(): number;
  quietForMs(): number;
  setRate(rate: number): void;
  setVoice(voiceId: string): void;
}

export interface SoundEffects {
  giftHit(tier: GiftTier): void;
  stageCall(): void;
  drop(): void;
  partyHorn(): void;
}

export interface Clock {
  now(): number;
  every(ms: number, fn: () => void): () => void; // returns a cancel function
  after(ms: number, fn: () => void): () => void;
}

export const browserClock: Clock = {
  now: () => Date.now(),
  every: (ms, fn) => {
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
  },
  after: (ms, fn) => {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
  },
};
