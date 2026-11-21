/**
 * The bar's live state and the rules that change it, driven by TikTok events and dashboard commands.
 * UI reads immutable snapshots (subscribe/getState fits React's useSyncExternalStore).
 */
import { DEFAULT_SETTINGS, EMPTY_STATUS, type ChatMessage, type GiftMessage, type LikeMessage, type LiveStatus, type StageCommand, type StageSettings, type Viewer } from '../../shared/contracts';
import { skinFromComment } from '../domain/skins';
import { balanceBots, setSkin, upsertClubber, type Clubber } from '../domain/dancefloor';
import { giftNameVi, giftTier, type GiftTier } from '../domain/gifts';
import { hasKeyword } from '../domain/keyword';
import { addPoints, POINTS_PER_COIN, POINTS_PER_COMMENT, viewerKey, type LeaderEntry } from '../domain/leaderboard';
import { addLikes, type LikeStreaks } from '../domain/likeStreak';
import { addHearts, INITIAL_LIKES, newHearts, type LikeMeterState } from '../domain/likeMeter';
import { maskBanned } from '../domain/moderation';
import type { Clock, SoundEffects } from './ports';
import type { VoiceAnnouncer } from './VoiceAnnouncer';

export type StageCall = {
  id: string;
  key: string;
  name: string;
  avatar: string;
  gift?: { name: string; tier: GiftTier; coins: number };
};

export type GiftToast = { id: string; name: string; avatar: string; giftName: string; count: number; tier: GiftTier };

/** Every like (heart tap) from a viewer, for the on-screen hearts: seq changes on each one. */
export type HeartPulse = { seq: number; count: number; name: string };

export type ClubState = {
  settings: StageSettings;
  status: LiveStatus;
  crowd: Clubber[];
  leaders: LeaderEntry[];
  likes: LikeMeterState;
  stageCalls: StageCall[];
  toasts: GiftToast[];
  drops: number; // counts up: each increment is one beat drop
  heartPulse: HeartPulse;
};

const JOIN_TO_FLOOR_MS = 5000;
const KEYWORD_COOLDOWN_MS = 60_000;
const SHARE_REMINDER_MS = 5 * 60_000;
const RECENT_MS = 5 * 60_000;
const TOAST_MS = 5000;
const MAX_STAGE_CALLS = 20;

export class ClubSession {
  private state: ClubState = {
    settings: DEFAULT_SETTINGS,
    status: EMPTY_STATUS,
    crowd: [],
    leaders: [],
    likes: INITIAL_LIKES,
    stageCalls: [],
    toasts: [],
    drops: 0,
    heartPulse: { seq: 0, count: 0, name: '' },
  };
  private listeners = new Set<() => void>();
  private lastKeywordAt = new Map<string, number>();
  private lastLikeCallAt = new Map<string, number>(); // apart from the keyword: a heart must not block a later "quẩy"
  private likeStreaks: LikeStreaks = new Map();
  private recent = new Map<string, number>(); // name -> last comment/gift time
  private stops: Array<() => void> = [];
  private seq = 0;

  constructor(
    private readonly clock: Clock,
    private readonly sfx: SoundEffects,
    private readonly announcer: VoiceAnnouncer | null // null on the silent dashboard
  ) {}

  // --- store plumbing -------------------------------------------------------
  getState = () => this.state;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private set(patch: Partial<ClubState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  private nextId(prefix: string) {
    return `${prefix}-${this.clock.now()}-${++this.seq}`;
  }

  start() {
    this.set({ crowd: balanceBots(this.state.crowd, this.clock.now()) });
    this.announcer?.start();
    if (this.announcer) this.stops.push(this.clock.every(SHARE_REMINDER_MS, () => this.shareReminder()));
  }

  dispose() {
    this.announcer?.stop();
    this.stops.forEach((s) => s());
    this.stops = [];
  }

  // --- inputs ---------------------------------------------------------------
  applySettings(settings: StageSettings) {
    this.set({ settings });
  }

  applyStatus(status: LiveStatus) {
    this.set({ status });
  }

  applyViewerCount(viewerCount: number) {
    this.set({ status: { ...this.state.status, viewerCount } });
  }

  join(viewer: Viewer) {
    this.announcer?.join(viewer.name);
    this.clock.after(JOIN_TO_FLOOR_MS, () => this.toFloor(viewer.name, viewer.avatar));
  }

  follow(viewer: Viewer) {
    this.announcer?.follow(viewer.name);
  }

  // `test` = made by a dashboard test button: acts like a real one but is never named in the share reminder
  chat(msg: ChatMessage, test = false) {
    const now = this.clock.now();
    if (!test) this.noteActive(msg.name);
    this.toFloor(msg.name, msg.avatar);
    this.set({ leaders: addPoints(this.state.leaders, maskBanned(msg.name), POINTS_PER_COMMENT, msg.avatar) });
    const skin = skinFromComment(msg.text);
    if (skin) this.set({ crowd: setSkin(this.state.crowd, viewerKey(msg.name), skin) });
    if (!hasKeyword(msg.text, this.state.settings.keyword)) return;
    const key = viewerKey(msg.name);
    if (now - (this.lastKeywordAt.get(key) ?? 0) < KEYWORD_COOLDOWN_MS) return;
    this.lastKeywordAt.set(key, now);
    this.callToStage({ id: this.nextId('call'), key, name: maskBanned(msg.name), avatar: msg.avatar });
    this.sfx.stageCall();
  }

  gift(msg: GiftMessage, test = false) {
    const coins = msg.coinsEach * msg.count;
    const tier = giftTier(coins);
    const name = maskBanned(msg.name);
    const giftName = giftNameVi(msg.giftName);
    if (!test) this.noteActive(msg.name);
    this.toFloor(msg.name, msg.avatar);
    this.set({ leaders: addPoints(this.state.leaders, name, coins * POINTS_PER_COIN, msg.avatar, coins) });
    this.callToStage({ id: this.nextId('gift'), key: viewerKey(msg.name), name, avatar: msg.avatar, gift: { name: giftName, tier, coins } });
    this.showToast({ id: this.nextId('toast'), name, avatar: msg.avatar, giftName, count: msg.count, tier });
    this.sfx.giftHit(tier);
    this.announcer?.giftThanks(msg.name, giftName, tier);
  }

  like(msg: LikeMessage) {
    if (msg.name) this.announcer?.likeThanks(msg.name);
    this.countLikeStreak(msg);
    const pulse = this.state.heartPulse;
    this.set({ heartPulse: { seq: pulse.seq + 1, count: Math.max(1, msg.count), name: msg.name ? maskBanned(msg.name) : '' } });
    const { hearts, lastRoomTotal } = newHearts(this.state.likes, msg.count, msg.totalLikes);
    if (msg.totalLikes > 0) this.set({ status: { ...this.state.status, totalLikes: msg.totalLikes } });
    if (hearts <= 0) {
      this.set({ likes: { ...this.state.likes, lastRoomTotal } });
      return;
    }
    const outcome = addHearts({ ...this.state.likes, lastRoomTotal }, hearts, this.clock.now());
    this.set({ likes: outcome.state });
    if (outcome.partyStarted) {
      this.sfx.partyHorn();
      this.announcer?.partyStart();
    }
    if (outcome.drop) this.drop(!outcome.partyStarted);
  }

  command(cmd: StageCommand) {
    switch (cmd.action) {
      case 'speak':
        this.announcer?.speakNow(cmd.text);
        break;
      case 'shareReminder':
        // the button is a plain "please share": no names read out
        this.announcer?.shareReminder([]);
        break;
      case 'drop':
        this.drop(true);
        break;
      case 'testGift':
        this.gift({ id: cmd.name, name: cmd.name, avatar: '', giftName: 'Rose', coinsEach: cmd.coins, count: 1 }, true);
        break;
      case 'testLike':
        this.like({ name: cmd.name, count: cmd.count, totalLikes: 0 });
        break;
      case 'testComment':
        this.chat({ id: cmd.name, name: cmd.name, avatar: '', text: cmd.text }, true);
        break;
    }
  }

  // --- rules ----------------------------------------------------------------
  private toFloor(name: string, avatar: string) {
    const now = this.clock.now();
    this.set({ crowd: balanceBots(upsertClubber(this.state.crowd, maskBanned(name), avatar, now, viewerKey(name)), now) });
  }

  // LIKES_FOR_STAGE taps in a row put the viewer on the stage, same as a keyword comment (own cooldown)
  private countLikeStreak(msg: LikeMessage) {
    if (!msg.name) return;
    const key = viewerKey(msg.name);
    const { streaks, reached } = addLikes(this.likeStreaks, key, msg.count, this.clock.now());
    this.likeStreaks = streaks;
    if (!reached) return;
    const now = this.clock.now();
    if (now - (this.lastLikeCallAt.get(key) ?? 0) < KEYWORD_COOLDOWN_MS) return;
    this.lastLikeCallAt.set(key, now);
    const avatar = this.state.crowd.find((c) => c.key === key)?.avatar ?? '';
    this.toFloor(msg.name, avatar);
    this.callToStage({ id: this.nextId('call'), key, name: maskBanned(msg.name), avatar });
    this.sfx.stageCall();
  }

  private callToStage(call: StageCall) {
    this.set({ stageCalls: [...this.state.stageCalls, call].slice(-MAX_STAGE_CALLS) });
  }

  private showToast(toast: GiftToast) {
    this.set({ toasts: [toast, ...this.state.toasts].slice(0, 3) });
    this.clock.after(TOAST_MS, () => this.set({ toasts: this.state.toasts.filter((t) => t.id !== toast.id) }));
  }

  private drop(withVoice: boolean) {
    this.set({ drops: this.state.drops + 1 });
    this.sfx.drop();
    if (withVoice) this.announcer?.drop();
  }

  private noteActive(name: string) {
    this.recent.delete(name);
    this.recent.set(name, this.clock.now());
    if (this.recent.size > 50) this.recent.delete(this.recent.keys().next().value!);
  }

  private shareReminder() {
    const since = this.clock.now() - RECENT_MS;
    const names = [...this.recent].filter(([, t]) => t > since).map(([n]) => n).reverse().slice(0, 3);
    this.announcer?.shareReminder(names);
  }
}
