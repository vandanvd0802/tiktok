/**
 * The race show's live state and the rules that change it, driven by TikTok events, dashboard commands and
 * the frame clock (`tick`). One race at a time, LANES runners; the rest wait in the queue (shown on screen).
 *   lobby (a few seconds to join) -> countdown -> racing -> results -> lobby ...
 * Empty lanes are filled with bots so there is always a race to watch. During a race anyone can comment a lane
 * number to cheer that runner on; the MC calls lead changes, falls and neck-and-neck finishes (shown in slow
 * motion); winners build up wins and streaks on the VUA ĐƯỜNG ĐUA board, the latest winner wears the crown.
 * UI reads immutable snapshots (subscribe/getState fits React's useSyncExternalStore); the 3D scene reads the
 * live Race object every frame through `race()`.
 */
import { DEFAULT_SETTINGS, EMPTY_STATUS, type ChatMessage, type GiftMessage, type LikeMessage, type LiveStatus, type StageCommand, type StageSettings, type Viewer } from '../../shared/contracts';
import { addCheer, CHEER_BOOST_S, CHEER_COOLDOWN_MS, emptyCheers, laneFromComment, type CheerState } from '../domain/cheer';
import { recordWin, streakOf, type ChampionEntry } from '../domain/champions';
import { giftNameVi, giftTier, type GiftTier } from '../domain/gifts';
import { hasKeyword } from '../domain/keyword';
import { addDonation, viewerKey, type LeaderEntry } from '../domain/leaderboard';
import { maskBanned } from '../domain/moderation';
import { FLY_SECONDS, LANES, Race, type Entrant, type RaceEvent } from '../domain/race';
import { enqueue, queuePosition, takeNext, type QueueEntry } from '../domain/raceQueue';
import { isReskinComment, pickSkins } from '../domain/skins';
import type { Clock, SoundEffects } from './ports';
import type { VoiceAnnouncer } from './VoiceAnnouncer';

export type GiftToast = { id: string; name: string; avatar: string; giftName: string; count: number; tier: GiftTier; flying: boolean };

/** Every like (heart tap) from a viewer, for the on-screen hearts: seq changes on each one. */
export type HeartPulse = { seq: number; count: number; name: string };

export type RacePhase = 'lobby' | 'countdown' | 'racing' | 'results';

export type Standing = {
  key: string;
  name: string;
  avatar: string;
  bot: boolean;
  lane: number; // 0-based; viewers cheer with lane + 1
  place: number | null;
  distance: number;
  flying: boolean;
  turbo: boolean;
  cheers: number;
};

export type RaceView = {
  number: number; // race #n since the page opened
  phase: RacePhase;
  secondsLeft: number; // lobby / countdown / results: whole seconds until the next phase
  elapsed: number; // seconds since the start gun
  standings: Standing[]; // current order (empty in the lobby)
  photoFinish: boolean; // neck and neck before the line: shown in slow motion
};

export type RaceState = {
  settings: StageSettings;
  status: LiveStatus;
  leaders: LeaderEntry[];
  queue: QueueEntry[];
  race: RaceView;
  champions: ChampionEntry[];
  crown: string; // key of the latest real winner ('' before anyone wins)
  toasts: GiftToast[];
  heartPulse: HeartPulse;
};

const LOBBY_S = { empty: 10, full: 4 }; // a full queue starts sooner
const RESULTS_S = 7;
const SHARE_REMINDER_MS = 5 * 60_000;
const RECENT_MS = 5 * 60_000;
const TOAST_MS = 5000;
const VIEW_REFRESH_S = 0.25; // standings on screen refresh 4 times a second
const LIKE_TURBO_S = 1.5;
const LIKE_TURBO_COOLDOWN_MS = 3000;
const PHOTO_FINISH_SPEED = 0.35; // race clock rate while neck and neck before the line
const RESKIN_COOLDOWN_MS = 2000; // one outfit change per viewer this often
const LEAD_CALL_AFTER_S = 3; // the start is a scramble: lead changes are called only after this

const BOT_NAMES = ['Gió Lốc', 'Tia Chớp', 'Báo Đốm', 'Siêu Tốc', 'Mũi Tên', 'Sấm Sét', 'Phản Lực', 'Bão Táp', 'Lốc Xoáy', 'Thần Gió'];

export class RaceSession {
  private state: RaceState = {
    settings: DEFAULT_SETTINGS,
    status: EMPTY_STATUS,
    leaders: [],
    queue: [],
    race: { number: 0, phase: 'lobby', secondsLeft: LOBBY_S.empty, elapsed: 0, standings: [], photoFinish: false },
    champions: [],
    crown: '',
    toasts: [],
    heartPulse: { seq: 0, count: 0, name: '' },
  };
  private listeners = new Set<() => void>();
  private current: Race | null = null;
  private phaseLeft = LOBBY_S.empty; // seconds left in lobby / results
  private sinceView = 0;
  private lastTurboAt = new Map<string, number>();
  private cheers: CheerState = emptyCheers(LANES);
  private lastCheerAt = new Map<string, number>();
  private lastReskinAt = new Map<string, number>();
  private leaderKey = '';
  private photoFinishCalled = false;
  private recent = new Map<string, number>(); // name -> last comment/gift time
  private stops: Array<() => void> = [];
  private seq = 0;
  private botSeq = 0;

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

  /** The race being run (countdown, racing or results), for the 3D scene. */
  race = (): Race | null => this.current;

  /** True while the finish is shown in slow motion. */
  slowMotion = () => this.state.race.photoFinish;

  private set(patch: Partial<RaceState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  private nextId(prefix: string) {
    return `${prefix}-${this.clock.now()}-${++this.seq}`;
  }

  start() {
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
  }

  follow(viewer: Viewer) {
    this.announcer?.follow(viewer.name);
  }

  // `test` = made by a dashboard test button: acts like a real one but is never named in the share reminder
  chat(msg: ChatMessage, test = false) {
    if (!test) this.noteActive(msg.name);
    if (this.reskin(msg.name, msg.text)) return;
    if (this.cheer(msg.name, msg.text)) return;
    if (!hasKeyword(msg.text, this.state.settings.keyword)) return;
    const entrant = this.entrant(msg.name, msg.avatar);
    if (this.current?.has(entrant.key) && this.state.race.phase !== 'results') return; // already running
    if (queuePosition(this.state.queue, entrant.key)) return;
    this.set({ queue: enqueue(this.state.queue, entrant) });
    this.hurryIfFull();
    this.sfx.queued();
    this.announcer?.queued(msg.name, queuePosition(this.state.queue, entrant.key));
  }

  gift(msg: GiftMessage, test = false) {
    const coins = msg.coinsEach * msg.count;
    const tier = giftTier(coins);
    const giftName = giftNameVi(msg.giftName);
    const entrant = this.entrant(msg.name, msg.avatar);
    if (!test) this.noteActive(msg.name);
    this.set({ leaders: addDonation(this.state.leaders, entrant.name, coins, msg.avatar) });
    // In the race (countdown included): fly over the hurdles. Otherwise: jump the queue.
    const racing = this.current && this.state.race.phase !== 'results' && this.current.fly(entrant.key, FLY_SECONDS[tier]);
    if (!racing) {
      this.set({ queue: enqueue(this.state.queue, entrant, true) });
      this.hurryIfFull();
    }
    this.showToast({ id: this.nextId('toast'), name: entrant.name, avatar: msg.avatar, giftName, count: msg.count, tier, flying: Boolean(racing) });
    this.sfx.giftHit(tier);
    this.announcer?.giftThanks(msg.name, giftName, tier, Boolean(racing));
    if (racing) this.refreshView();
  }

  like(msg: LikeMessage) {
    if (msg.name) this.announcer?.likeThanks(msg.name);
    const pulse = this.state.heartPulse;
    this.set({ heartPulse: { seq: pulse.seq + 1, count: Math.max(1, msg.count), name: msg.name ? maskBanned(msg.name) : '' } });
    if (msg.totalLikes > 0) this.set({ status: { ...this.state.status, totalLikes: msg.totalLikes } });
    // A runner's own hearts give them a short burst of speed
    if (!msg.name || this.state.race.phase !== 'racing') return;
    const key = viewerKey(msg.name);
    const now = this.clock.now();
    if (now - (this.lastTurboAt.get(key) ?? 0) < LIKE_TURBO_COOLDOWN_MS) return;
    if (this.current?.turbo(key, LIKE_TURBO_S)) this.lastTurboAt.set(key, now);
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
      case 'startRace':
        if (this.state.race.phase === 'lobby') this.phaseLeft = 0;
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

  /** Advances the show by `dt` seconds (called every animation frame by the stage). */
  tick(dt: number) {
    switch (this.state.race.phase) {
      case 'lobby':
        this.phaseLeft -= dt;
        if (this.phaseLeft <= 0) this.startRace();
        else this.showSeconds(this.phaseLeft);
        break;
      case 'countdown':
      case 'racing':
        this.runRace(this.state.race.photoFinish ? dt * PHOTO_FINISH_SPEED : dt);
        break;
      case 'results':
        this.phaseLeft -= dt;
        if (this.phaseLeft <= 0) this.toLobby();
        else this.showSeconds(this.phaseLeft);
        break;
    }
  }

  // --- race flow --------------------------------------------------------------
  private startRace() {
    const { taken, rest } = takeNext(this.state.queue, LANES);
    const field: Entrant[] = taken.map(({ priority: _p, ...e }) => e);
    while (field.length < LANES) field.push(this.bot());
    this.current = new Race(field, pickSkins(LANES));
    this.sinceView = 0;
    this.cheers = emptyCheers(LANES);
    this.lastCheerAt.clear();
    this.leaderKey = '';
    this.photoFinishCalled = false;
    this.set({ queue: rest, race: this.view('countdown') });
    this.announcer?.raceIntro(taken.map((e) => e.name));
  }

  private runRace(dt: number) {
    const race = this.current!;
    const wasStarted = race.started;
    const events = race.step(dt);
    if (!wasStarted && race.started) {
      this.sfx.raceStart();
      this.set({ race: this.view('racing') });
    }
    events.forEach((e) => this.onRaceEvent(e));
    if (race.started) this.watchRace(race);
    if (race.over) {
      this.phaseLeft = RESULTS_S;
      this.set({ race: this.view('results') });
      this.announceResults();
      return;
    }
    this.sinceView += dt;
    const shownSecond = Math.ceil(-race.time);
    if (this.sinceView >= VIEW_REFRESH_S || (!race.started && shownSecond !== this.state.race.secondsLeft)) this.refreshView();
  }

  private onRaceEvent(e: RaceEvent) {
    if (e.type === 'finish' && e.place === 1) this.sfx.winner();
    if (e.type === 'trip') {
      const r = this.current!.runners.find((x) => x.key === e.key)!;
      if (r.key === this.leaderKey || !r.bot) this.announcer?.tripped(r.name);
    }
  }

  // Lead changes and the slow-motion finish
  private watchRace(race: Race) {
    const leader = race.standings()[0];
    if (leader.key !== this.leaderKey) {
      const isPass = this.leaderKey !== '' && race.time > LEAD_CALL_AFTER_S;
      this.leaderKey = leader.key;
      if (isPass && leader.place === null) this.announcer?.newLeader(leader.name);
    }
    const photo = race.isPhotoFinish();
    if (photo !== this.state.race.photoFinish) {
      this.set({ race: { ...this.state.race, photoFinish: photo } });
      if (photo && !this.photoFinishCalled) {
        this.photoFinishCalled = true;
        this.announcer?.photoFinish();
      }
    }
  }

  // "người" from a runner in the current race: they change into another character (returns true when it was one)
  private reskin(name: string, text: string): boolean {
    const key = viewerKey(name);
    if (!this.current?.has(key) || !isReskinComment(text)) return false;
    const now = this.clock.now();
    if (now - (this.lastReskinAt.get(key) ?? -Infinity) < RESKIN_COOLDOWN_MS) return true;
    this.current.reskin(key);
    this.lastReskinAt.set(key, now);
    return true;
  }

  // A lane number from anyone during the race is a cheer for that runner (returns true when it was one)
  private cheer(name: string, text: string): boolean {
    const phase = this.state.race.phase;
    if (phase !== 'countdown' && phase !== 'racing') return false;
    const lane = laneFromComment(text, LANES);
    if (lane === null) return false;
    const key = viewerKey(name);
    const now = this.clock.now();
    if (now - (this.lastCheerAt.get(key) ?? -Infinity) < CHEER_COOLDOWN_MS) return true;
    this.lastCheerAt.set(key, now);
    const { state, boost } = addCheer(this.cheers, lane);
    this.cheers = state;
    const runner = this.current!.inLane(lane);
    if (boost && runner && this.current!.turbo(runner.key, CHEER_BOOST_S)) this.announcer?.cheerBoost(runner.name);
    return true;
  }

  private announceResults() {
    const race = this.current!;
    const podium = race.standings().slice(0, 3);
    const winner = podium[0];
    const champions = recordWin(this.state.champions, winner, [...race.runners]);
    this.set({ champions, crown: winner.bot ? this.state.crown : winner.key });
    this.announcer?.results(podium.map((r) => r.name), winner.bot ? 0 : streakOf(champions, winner.key));
  }

  private toLobby() {
    this.current = null;
    this.phaseLeft = this.state.queue.length >= LANES ? LOBBY_S.full : LOBBY_S.empty;
    this.set({ race: { number: this.state.race.number, phase: 'lobby', secondsLeft: Math.ceil(this.phaseLeft), elapsed: 0, standings: [], photoFinish: false } });
  }

  // A full field waiting: the lobby is cut short
  private hurryIfFull() {
    if (this.state.race.phase === 'lobby' && this.state.queue.length >= LANES) this.phaseLeft = Math.min(this.phaseLeft, LOBBY_S.full);
  }

  private refreshView() {
    this.sinceView = 0;
    this.set({ race: this.view(this.state.race.phase) });
  }

  private view(phase: RacePhase): RaceView {
    const race = this.current!;
    const number = phase === 'countdown' && this.state.race.phase === 'lobby' ? this.state.race.number + 1 : this.state.race.number;
    return {
      number,
      phase,
      secondsLeft: phase === 'countdown' ? Math.max(1, Math.ceil(-race.time)) : phase === 'results' ? Math.ceil(this.phaseLeft) : 0,
      elapsed: Math.max(0, race.time),
      standings: race.standings().map((r) => ({
        key: r.key,
        name: r.name,
        avatar: r.avatar,
        bot: r.bot,
        lane: r.lane,
        place: r.place,
        distance: r.distance,
        flying: race.isFlying(r),
        turbo: race.isTurbo(r),
        cheers: this.cheers.counts[r.lane],
      })),
      photoFinish: phase === 'results' ? false : this.state.race.photoFinish,
    };
  }

  private showSeconds(left: number) {
    const s = Math.ceil(left);
    if (s !== this.state.race.secondsLeft) this.set({ race: { ...this.state.race, secondsLeft: s } });
  }

  private entrant(name: string, avatar: string): Entrant {
    return { key: viewerKey(name), name: maskBanned(name), avatar, bot: false };
  }

  private bot(): Entrant {
    const n = this.botSeq++;
    return { key: `bot-${n}`, name: BOT_NAMES[n % BOT_NAMES.length], avatar: '', bot: true };
  }

  // --- voice housekeeping ------------------------------------------------------
  private showToast(toast: GiftToast) {
    this.set({ toasts: [toast, ...this.state.toasts].slice(0, 3) });
    this.clock.after(TOAST_MS, () => this.set({ toasts: this.state.toasts.filter((t) => t.id !== toast.id) }));
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

