/**
 * Decides what the voice says and when. Gift thanks jump the queue; newcomers are greeted in batches
 * (3 names per sentence) whenever the voice is not backed up; a quiet live gets a short hype line.
 */
import { nameForSpeech } from '../domain/speechName';
import { voiceLines } from '../domain/voiceLines';
import type { GiftTier } from '../domain/gifts';
import type { Clock, SpeechOutput } from './ports';

const GREET_EVERY_MS = 4000;
const NAMES_PER_GREETING = 3;
const MAX_WAITING_GREETINGS = 30;
const BACKLOG_LIMIT = 2; // greet only when at most this many lines are waiting
const GIFT_COMBO_MS = 8000; // one thanks per person per combo
const LIKE_THANKS_COOLDOWN_MS = 30_000; // one "thanks for the heart" per person per this long
const HYPE_EVERY_MS = { min: 20_000, max: 30_000 };

export type AnnouncerContext = () => { channelName: string; keyword: string };

export class VoiceAnnouncer {
  private waitingGreetings: string[] = [];
  private greeted = new Set<string>();
  private lastThanked = new Map<string, number>();
  private lastLikeThanked = new Map<string, number>();
  private stops: Array<() => void> = [];
  private cancelHype: (() => void) | null = null;

  constructor(
    private readonly speech: SpeechOutput,
    private readonly context: AnnouncerContext,
    private readonly clock: Clock
  ) {}

  start() {
    this.stop();
    this.stops.push(this.clock.every(GREET_EVERY_MS, () => this.greetWaiting()));
    this.scheduleHype();
  }

  stop() {
    this.stops.forEach((s) => s());
    this.stops = [];
    this.cancelHype?.();
    this.cancelHype = null;
  }

  join(name: string) {
    const key = name.toLowerCase();
    if (this.greeted.has(key) || this.waitingGreetings.some((n) => n.toLowerCase() === key)) return;
    // in a flood only the newest wait
    this.waitingGreetings = [...this.waitingGreetings, name].slice(-MAX_WAITING_GREETINGS);
  }

  giftThanks(name: string, giftName: string, tier: GiftTier) {
    const key = name.toLowerCase();
    const now = this.clock.now();
    if (now - (this.lastThanked.get(key) ?? 0) < GIFT_COMBO_MS) return;
    this.lastThanked.set(key, now);
    this.greeted.add(key); // a thanks is a greeting too
    this.speech.say(voiceLines.giftThanks(nameForSpeech(name), giftName, tier), true);
  }

  follow(name: string) {
    this.speech.say(voiceLines.follow(nameForSpeech(name), this.context().channelName));
  }

  // The first heart is thanked by name; further hearts from the same person stay quiet for a while
  likeThanks(name: string) {
    const key = name.toLowerCase();
    const now = this.clock.now();
    if (now - (this.lastLikeThanked.get(key) ?? 0) < LIKE_THANKS_COOLDOWN_MS) return;
    this.lastLikeThanked.set(key, now);
    this.speech.say(voiceLines.likeThanks(nameForSpeech(name)));
  }

  drop() {
    this.speech.say(voiceLines.drop());
  }

  partyStart() {
    this.speech.say(voiceLines.partyStart(), true);
  }

  shareReminder(recentNames: string[]) {
    this.speech.say(voiceLines.shareReminder(recentNames.map(nameForSpeech), this.context().channelName));
  }

  speakNow(text: string) {
    this.speech.say(text, true);
  }

  // A hype line every HYPE_EVERY_MS (random), whether or not the room is quiet; skipped while the voice is backed up
  private scheduleHype() {
    const delay = HYPE_EVERY_MS.min + Math.random() * (HYPE_EVERY_MS.max - HYPE_EVERY_MS.min);
    this.cancelHype = this.clock.after(delay, () => {
      if (this.speech.pending() <= BACKLOG_LIMIT) {
        const { channelName, keyword } = this.context();
        this.speech.say(voiceLines.idleHype(channelName, keyword));
      }
      this.scheduleHype();
    });
  }

  private greetWaiting() {
    if (!this.waitingGreetings.length || this.speech.pending() > BACKLOG_LIMIT) return;
    const names = this.waitingGreetings.splice(0, NAMES_PER_GREETING);
    names.forEach((n) => this.greeted.add(n.toLowerCase()));
    this.speech.say(voiceLines.welcome(names.map(nameForSpeech), this.context().channelName));
  }
}
