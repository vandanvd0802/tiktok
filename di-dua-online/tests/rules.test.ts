import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RaceSession } from '../src/application/RaceSession';
import type { Clock, SoundEffects, SpeechOutput } from '../src/application/ports';
import { VoiceAnnouncer } from '../src/application/VoiceAnnouncer';
import { hasKeyword } from '../src/domain/keyword';
import { addDonation } from '../src/domain/leaderboard';
import { FLY_SECONDS, HURDLES, LANES, Race, TRACK_LENGTH, type Entrant } from '../src/domain/race';
import { enqueue, queuePosition, takeNext } from '../src/domain/raceQueue';
import { CHARACTER_SKINS, pickSkins } from '../src/domain/skins';
import { nameForSpeech } from '../src/domain/speechName';
import { SettingsService } from '../server/application/SettingsService';
import { SpeechService } from '../server/application/SpeechService';

class FakeClock implements Clock {
  t = 1_000_000;
  timers: Array<{ at: number; every?: number; fn: () => void; live: boolean }> = [];
  now = () => this.t;
  every = (ms: number, fn: () => void) => this.add(ms, fn, ms);
  after = (ms: number, fn: () => void) => this.add(ms, fn);
  private add(ms: number, fn: () => void, every?: number) {
    const timer = { at: this.t + ms, every, fn, live: true };
    this.timers.push(timer);
    return () => (timer.live = false);
  }
  advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      const next = this.timers.filter((x) => x.live && x.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      this.t = next.at;
      if (next.every) next.at += next.every;
      else next.live = false;
      next.fn();
    }
    this.t = end;
  }
}

class FakeSpeech implements SpeechOutput {
  lines: Array<{ text: string; priority: boolean }> = [];
  quiet = 0;
  say(text: string, priority = false) {
    this.lines.push({ text, priority });
  }
  pending() {
    return 0;
  }
  quietForMs() {
    return this.quiet;
  }
  setRate() {}
  setVoice() {}
  warm() {}
}

const silentFx: SoundEffects = { giftHit() {}, queued() {}, raceStart() {}, winner() {} };

function makeSession() {
  const clock = new FakeClock();
  const speech = new FakeSpeech();
  let session!: RaceSession;
  const announcer = new VoiceAnnouncer(speech, () => session.getState().settings, clock);
  session = new RaceSession(clock, silentFx, announcer);
  session.start();
  return { clock, speech, session };
}

test('keyword matches without accents or case', () => {
  assert.ok(hasKeyword('QUẨY lên nào 🔥', 'quẩy'));
  assert.ok(hasKeyword('quay', 'quẩy'));
  assert.ok(!hasKeyword('hello', 'quẩy'));
});

test('names are read cleanly and banned names become "bạn"', () => {
  assert.equal(nameForSpeech('𝑵𝒈𝒐𝒄 Anh99💥'), 'Ngoc Anh chín chín');
  assert.equal(nameForSpeech('đm abc'), 'bạn');
});

test('a hype line is said every 20-30 seconds, even when the room is not quiet', () => {
  const { clock, speech } = makeSession();
  speech.quiet = 0;
  clock.advance(19_999);
  assert.equal(speech.lines.length, 0, 'never before 20 s');
  clock.advance(10_001);
  assert.ok(speech.lines.length >= 1, 'at least one within 30 s');
  clock.advance(90_000); // 120 s in total: 4 to 6 lines whatever the random gaps are
  assert.ok(speech.lines.length >= 4 && speech.lines.length <= 6, `got ${speech.lines.length}`);
});

test('speech service caches, shares in-flight requests and falls back', async () => {
  let calls = 0;
  const broken = { name: 'broken', synthesize: async () => Promise.reject(new Error('down')) };
  const ok = { name: 'ok', synthesize: async (t: string, v: string) => (calls++, Buffer.from(`${v}:${t}`)) };
  const service = new SpeechService([broken, ok], 10, 100);
  const [a, b] = await Promise.all([service.speak('xin chào', 'A'), service.speak('xin  chào ', 'A')]);
  assert.equal(a.toString(), 'A:xin chào');
  assert.equal(b.toString(), 'A:xin chào');
  await service.speak('xin chào', 'A');
  assert.equal(calls, 1);
  assert.equal((await service.speak('xin chào', 'B')).toString(), 'B:xin chào', 'another voice is not served from cache');
  assert.equal(calls, 2);
});

test('settings accept only known voices and tracks, and drop vanished ones on load', () => {
  const published: unknown[] = [];
  const voices = { list: () => [{ id: 'v1', name: 'V1' }, { id: 'v2', name: 'V2' }], has: (id: string) => id === 'v1' || id === 'v2' };
  const music = { list: () => [{ file: 'a.mp3', name: 'a' }], has: (f: string) => f === 'a.mp3' };
  const repo = { load: () => ({ voiceId: 'gone', musicTrack: 'deleted.mp3' }), save: () => {} };
  const settings = new SettingsService(repo, { publish: (_e: string, d: unknown) => published.push(d) } as never, voices, music);
  assert.equal(settings.current().voiceId, 'v1');
  assert.equal(settings.current().musicTrack, '');
  assert.equal(settings.update({ voiceId: 'v2' }).voiceId, 'v2');
  assert.equal(settings.update({ musicTrack: 'a.mp3' }).musicTrack, 'a.mp3');
  assert.equal(settings.update({ musicTrack: '*' }).musicTrack, '*');
  assert.throws(() => settings.update({ voiceId: 'nope' }));
  assert.throws(() => settings.update({ musicTrack: '../server.ts' }));
  assert.equal(published.length, 3);
});

test('share reminder: the button reads no names, the timer names only real people (never test buttons)', () => {
  const { clock, speech, session } = makeSession();
  clock.advance(60_000);
  session.chat({ id: 'r', name: 'Thu Hà', avatar: '', text: 'hello' });
  session.command({ action: 'testGift', name: 'Đại Gia Test', coins: 199 });
  session.command({ action: 'testComment', name: 'Khách Test', text: 'vào đua' });
  speech.lines.length = 0;
  session.command({ action: 'shareReminder' });
  assert.equal(speech.lines.length, 1);
  assert.doesNotMatch(speech.lines[0].text, /Thu Hà|Test/);
  speech.lines.length = 0;
  clock.advance(4 * 60_000);
  // hype lines also mention sharing, so pick the reminder that names someone
  const timed = speech.lines.find((l) => /chia sẻ/i.test(l.text) && /Thu Hà/.test(l.text))!;
  assert.match(timed.text, /Thu Hà/);
  assert.doesNotMatch(timed.text, /Test/);
});

const person = (name: string, bot = false): Entrant => ({ key: name.toLowerCase(), name, avatar: '', bot });

test('the queue: keyword joins at the back, a gift jumps ahead of non-gifters only, nobody twice', () => {
  let q = enqueue([], person('A'));
  q = enqueue(q, person('B'));
  q = enqueue(q, person('A'));
  assert.deepEqual(q.map((e) => e.name), ['A', 'B']);
  q = enqueue(q, person('C'), true);
  q = enqueue(q, person('D'), true);
  assert.deepEqual(q.map((e) => e.name), ['C', 'D', 'A', 'B']);
  q = enqueue(q, person('B'), true);
  assert.deepEqual(q.map((e) => e.name), ['C', 'D', 'B', 'A']);
  assert.equal(queuePosition(q, 'a'), 4);
  const { taken, rest } = takeNext(q, 3);
  assert.deepEqual(taken.map((e) => e.name), ['C', 'D', 'B']);
  assert.deepEqual(rest.map((e) => e.name), ['A']);
});

test('top donate counts coins only, biggest first', () => {
  let board = addDonation([], 'An', 1);
  board = addDonation(board, 'Binh', 10);
  board = addDonation(board, 'an', 20);
  board = addDonation(board, 'Chi', 0);
  assert.deepEqual(board.map((e) => [e.name, e.coins]), [['An', 21], ['Binh', 10]]);
});

test('runners get different human skins', () => {
  const skins = pickSkins(LANES);
  assert.equal(new Set(skins).size, LANES);
  assert.ok(skins.every((s) => CHARACTER_SKINS.includes(s)));
});

test('a race waits for the countdown, everyone finishes with places 1..n, and the hurdles slow runners down', () => {
  const field = Array.from({ length: LANES }, (_, i) => person(`R${i}`));
  const race = new Race(field, pickSkins(LANES));
  race.step(1);
  assert.equal(race.runners[0].distance, 0, 'nobody moves during the countdown');
  for (let i = 0; i < 20_000 && !race.over; i++) race.step(0.02);
  const places = race.runners.map((r) => r.place).sort();
  assert.deepEqual(places, [1, 2, 3, 4, 5, 6, 7, 8]);
  const winner = race.standings()[0];
  assert.equal(winner.place, 1);
  // on foot 150 m at no more than 8 m/s takes over 18 s
  assert.ok(winner.finishedAt! > TRACK_LENGTH / 8, `winner too fast: ${winner.finishedAt}`);
});

test('every hurdle on foot is either hopped or tripped over; a flying runner soars over them', () => {
  // rng 0 = always hop, 0.99 = always trip
  const hopper = new Race([person('H')], pickSkins(1), () => 0);
  const tripper = new Race([person('T')], pickSkins(1), () => 0.99);
  const flyer = new Race([person('F')], pickSkins(1), () => 0.99);
  const count = (race: Race, type: string) => {
    let n = 0;
    for (let i = 0; i < 20_000 && !race.over; i++) n += race.step(0.02).filter((e) => e.type === type).length;
    return n;
  };
  assert.equal(count(hopper, 'hop'), HURDLES.length);
  assert.equal(count(tripper, 'trip'), HURDLES.length);
  flyer.fly('f', 1000);
  assert.equal(count(flyer, 'soar'), HURDLES.length);
  assert.ok(flyer.runners[0].finishedAt! < tripper.runners[0].finishedAt!, 'flying beats tripping');
});

test('in the session: "vào đua" queues a viewer once, races start with 8 lanes (bots fill), the rest wait', () => {
  const { session } = makeSession();
  for (let i = 0; i < 10; i++) session.chat({ id: `${i}`, name: `P${i}`, avatar: '', text: 'Vào đua!' });
  session.chat({ id: 'x', name: 'P0', avatar: '', text: 'vao dua' });
  session.chat({ id: 'y', name: 'Q', avatar: '', text: 'hello' });
  assert.equal(session.getState().queue.length, 10);
  session.tick(5); // a full queue starts after 4 s
  assert.equal(session.getState().race.phase, 'countdown');
  assert.equal(session.race()!.runners.length, LANES);
  assert.deepEqual(session.getState().queue.map((q) => q.name), ['P8', 'P9']);
  session.chat({ id: '0', name: 'P0', avatar: '', text: 'vào đua' });
  assert.equal(session.getState().queue.length, 2, 'a runner cannot queue while racing');
});

test('a gift during the race makes that runner fly; a gift from someone waiting moves them up the queue', () => {
  const { session } = makeSession();
  session.chat({ id: 'a', name: 'An', avatar: '', text: 'vào đua' });
  session.tick(11); // lobby over: An runs with 7 bots
  session.tick(3.5); // countdown over
  assert.equal(session.getState().race.phase, 'racing');
  for (const n of ['B', 'C']) session.chat({ id: n, name: n, avatar: '', text: 'vào đua' });
  session.gift({ id: 'a', name: 'An', avatar: '', giftName: 'Rose', coinsEach: 1, count: 1 });
  const race = session.race()!;
  const an = race.runners.find((r) => r.key === 'an')!;
  assert.ok(race.isFlying(an));
  session.tick(FLY_SECONDS.small + 0.1);
  assert.ok(!race.isFlying(an), 'flight ends after a few seconds');
  session.gift({ id: 'c', name: 'C', avatar: '', giftName: 'Rose', coinsEach: 1, count: 1 });
  assert.deepEqual(session.getState().queue.map((q) => q.name), ['C', 'B']);
  assert.deepEqual(session.getState().leaders.map((l) => [l.name, l.coins]), [['An', 1], ['C', 1]]);
});

test('after the race: results, then back to the lobby; bots never reach the queue or the donate board', () => {
  const { session } = makeSession();
  session.tick(11);
  for (let i = 0; i < 4000 && session.getState().race.phase !== 'results'; i++) session.tick(0.05);
  assert.equal(session.getState().race.phase, 'results');
  assert.equal(session.getState().race.standings[0].place, 1);
  for (let i = 0; i < 200 && session.getState().race.phase === 'results'; i++) session.tick(0.05);
  assert.equal(session.getState().race.phase, 'lobby');
  assert.equal(session.race(), null);
  assert.equal(session.getState().queue.length, 0);
  assert.equal(session.getState().leaders.length, 0);
});

class MemoryDisk {
  files = new Map<string, Buffer>();
  async has(key: string) {
    return this.files.has(key);
  }
  async get(key: string) {
    return this.files.get(key) ?? null;
  }
  async put(key: string, audio: Buffer) {
    this.files.set(key, audio);
  }
}

test('speech service: lines are saved to disk and read back after a restart, fallback audio is not saved', async () => {
  let calls = 0;
  const capcut = { name: 'capcut', synthesize: async (t: string) => (calls++, Buffer.from(`cc:${t}`)) };
  const disk = new MemoryDisk();
  await new SpeechService([capcut], 10, 100, disk).speak('xin chào', 'A');
  const restarted = new SpeechService([capcut], 10, 100, disk);
  assert.equal((await restarted.speak('xin chào', 'A')).toString(), 'cc:xin chào');
  assert.equal(calls, 1, 'second server read it from disk');

  const broken = { name: 'broken', synthesize: async () => Promise.reject(new Error('down')) };
  const edge = { name: 'edge', synthesize: async (t: string) => Buffer.from(`edge:${t}`) };
  const disk2 = new MemoryDisk();
  await new SpeechService([broken, edge], 10, 100, disk2).speak('hello', 'A');
  assert.equal(disk2.files.size, 0);
});

test('speech service: the same Vietnamese text in composed or decomposed form is one cache entry', async () => {
  let calls = 0;
  const capcut = { name: 'capcut', synthesize: async (t: string) => (calls++, Buffer.from(t)) };
  const service = new SpeechService([capcut], 10, 100, new MemoryDisk());
  await service.speak('Vào vị trí'.normalize('NFC'), 'A');
  await service.speak('Vào vị trí'.normalize('NFD'), 'A');
  assert.equal(calls, 1);
});

test('speech service warm-up synthesises only lines not cached yet, one at a time, and a newer warm-up stops the old one', async () => {
  const said: string[] = [];
  const capcut = { name: 'capcut', synthesize: async (t: string) => (said.push(t), Buffer.from(t)) };
  const disk = new MemoryDisk();
  const service = new SpeechService([capcut], 10, 100, disk, async () => {});
  assert.equal(await service.warm(['a', 'b', 'a', ' '], 'V', { gapMs: 0 }), 2);
  assert.equal(await service.warm(['a', 'b', 'c'], 'V', { gapMs: 0 }), 1);
  assert.deepEqual(said, ['a', 'b', 'c']);
  assert.equal(await service.warm(['a'], 'W', { gapMs: 0 }), 1, 'another voice is a different line');

  let release!: () => void;
  const slow = new SpeechService([capcut], 10, 100, new MemoryDisk(), () => new Promise<void>((r) => (release = r)));
  const first = slow.warm(['x', 'y', 'z'], 'V', { gapMs: 1 });
  await new Promise((r) => setTimeout(r, 0));
  const second = slow.warm(['q'], 'V', { gapMs: 1 });
  release();
  assert.equal(await first, 1, 'the old run stopped after its first line');
  await new Promise((r) => setTimeout(r, 0));
  release();
  assert.equal(await second, 1);
});

test('fixed MC lines hold no viewer name and use the channel name and keyword', async () => {
  const { fixedVoiceLines } = await import('../src/domain/voiceLines');
  const lines = fixedVoiceLines('Kênh X', 'vào đua');
  assert.ok(lines.length >= 10);
  assert.ok(lines.some((l) => l.includes('Kênh X')));
  assert.ok(lines.some((l) => l.includes('vào đua')));
});

test('cheering: only a lone lane number counts, every 5 cheers boost that lane', async () => {
  const { addCheer, CHEER_GOAL, emptyCheers, laneFromComment } = await import('../src/domain/cheer');
  assert.equal(laneFromComment('3', 8), 2);
  assert.equal(laneFromComment(' Làn 8! ', 8), 7);
  assert.equal(laneFromComment('số 1', 8), 0);
  assert.equal(laneFromComment('9', 8), null);
  assert.equal(laneFromComment('123', 8), null);
  assert.equal(laneFromComment('top 1', 8), null);
  let state = emptyCheers(8);
  let boosts = 0;
  for (let i = 0; i < CHEER_GOAL * 2; i++) {
    const out = addCheer(state, 4);
    state = out.state;
    if (out.boost) boosts++;
  }
  assert.equal(boosts, 2);
  assert.equal(state.counts[4], CHEER_GOAL * 2);
});

test('in the session: lane numbers from different viewers boost that runner, one viewer counts once per cooldown', () => {
  const { clock, session } = makeSession();
  session.tick(11);
  session.tick(3.5);
  const race = session.race()!;
  const lane3 = race.inLane(2)!;
  for (let i = 0; i < 5; i++) session.chat({ id: 'a', name: 'Same', avatar: '', text: '3' });
  assert.ok(!race.isTurbo(lane3), 'one person spamming is one cheer');
  for (let i = 0; i < 4; i++) session.chat({ id: `${i}`, name: `Fan${i}`, avatar: '', text: '3' });
  assert.ok(race.isTurbo(lane3), 'five different fans boost lane 3');
  clock.advance(2000);
  session.tick(0.3);
  assert.equal(session.getState().race.standings.find((s) => s.lane === 2)!.cheers, 5);
  assert.equal(session.getState().queue.length, 0, 'a cheer is not a queue request');
});

test('champions: wins and streaks per viewer, a loss resets the streak, bots never listed', async () => {
  const { recordWin, streakOf } = await import('../src/domain/champions');
  const an = person('An');
  const binh = person('Binh');
  const bot = person('Bot', true);
  let board = recordWin([], an, [an, binh, bot]);
  board = recordWin(board, an, [an, binh, bot]);
  assert.equal(streakOf(board, 'an'), 2);
  board = recordWin(board, bot, [an, binh, bot]);
  assert.equal(streakOf(board, 'an'), 0, 'losing to a bot ends the streak');
  board = recordWin(board, binh, [binh, bot]);
  assert.deepEqual(board.map((e) => [e.name, e.wins]), [['An', 2], ['Binh', 1]]);
  board = recordWin(board, binh, [binh]);
  assert.equal(streakOf(board, 'an'), 0, 'not running does not touch a streak');
  assert.equal(streakOf(board, 'binh'), 2);
});

test('after a race the winner gets the crown and a place on the champions board', () => {
  const { session } = makeSession();
  for (const n of ['An', 'Binh']) session.chat({ id: n, name: n, avatar: '', text: 'vào đua' });
  session.tick(11);
  session.race()!.fly('an', 1000);
  for (let i = 0; i < 4000 && session.getState().race.phase !== 'results'; i++) session.tick(0.05);
  assert.equal(session.getState().crown, 'an');
  assert.deepEqual(session.getState().champions.map((c) => [c.name, c.wins, c.streak]), [['An', 1, 1]]);
});

test('a neck-and-neck finish is a photo finish and the race clock slows down', () => {
  const race = new Race([person('A'), person('B')], pickSkins(2), () => 0);
  race.step(3);
  for (let i = 0; i < 20_000 && !race.isPhotoFinish() && !race.over; i++) {
    race.step(0.02);
    // keep them level: whoever is ahead gets no further than the other
    const [a, b] = race.runners as Array<{ distance: number }>;
    const level = Math.min(a.distance, b.distance) + 0.2;
    a.distance = Math.min(a.distance, level);
    b.distance = Math.min(b.distance, level);
  }
  assert.ok(race.isPhotoFinish());
  assert.ok(race.standings()[0].distance >= TRACK_LENGTH - 10);
});

test('commentary: a lead change and a fall are called, but never closer than a few seconds apart', () => {
  const clock = new FakeClock();
  const speech = new FakeSpeech();
  const announcer = new VoiceAnnouncer(speech, () => ({ channelName: 'K', keyword: 'vào đua' }), clock);
  announcer.newLeader('An');
  announcer.tripped('Binh');
  assert.equal(speech.lines.length, 1);
  clock.advance(4000);
  announcer.tripped('Binh');
  assert.equal(speech.lines.length, 2);
  assert.match(speech.lines[1].text, /Binh/);
  announcer.results(['An', 'Binh'], 3);
  assert.match(speech.lines[2].text, /3|ba/);
});

test('a runner commenting "người" changes into a skin nobody else wears', async () => {
  const { isReskinComment } = await import('../src/domain/skins');
  assert.ok(isReskinComment('người') && isReskinComment('Nguoi ') && isReskinComment('NGƯỜI!'));
  assert.ok(!isReskinComment('người chạy nhanh quá'));
  const entrants: Entrant[] = Array.from({ length: LANES }, (_, i) => ({ key: `k${i}`, name: `N${i}`, avatar: '', bot: false }));
  const race = new Race(entrants, pickSkins(LANES));
  for (let i = 0; i < 20; i++) {
    const before = race.runners[0].skin;
    assert.ok(race.reskin('k0'));
    assert.notEqual(race.runners[0].skin, before);
    assert.equal(new Set(race.runners.map((r) => r.skin)).size, LANES);
  }
  assert.equal(race.reskin('nobody'), false);
});
