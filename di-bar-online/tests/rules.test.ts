import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ClubSession } from '../src/application/ClubSession';
import type { Clock, SoundEffects, SpeechOutput } from '../src/application/ports';
import { VoiceAnnouncer } from '../src/application/VoiceAnnouncer';
import { balanceBots, MIN_CROWD, MIN_SPOT_GAP, pickSpot, realCount, SPOTS, upsertClubber } from '../src/domain/dancefloor';
import { hasKeyword } from '../src/domain/keyword';
import { addPoints } from '../src/domain/leaderboard';
import { addHearts, INITIAL_LIKES, newHearts, PARTY_LIKES } from '../src/domain/likeMeter';
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
}

const silentFx: SoundEffects = { giftHit() {}, stageCall() {}, drop() {}, partyHorn() {} };

function makeSession() {
  const clock = new FakeClock();
  const speech = new FakeSpeech();
  let session!: ClubSession;
  const announcer = new VoiceAnnouncer(speech, () => session.getState().settings, clock);
  session = new ClubSession(clock, silentFx, announcer);
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

test('leaderboard sorts by points and merges the same viewer', () => {
  let board = addPoints([], 'An', 1);
  board = addPoints(board, 'Binh', 10);
  board = addPoints(board, 'an', 20);
  assert.deepEqual(board.map((e) => [e.name, e.points]), [['An', 21], ['Binh', 10]]);
});

test('hearts: room total is counted once, party and drop trigger at their thresholds', () => {
  const first = newHearts(INITIAL_LIKES, 5, 100);
  assert.equal(first.hearts, 5);
  const repeat = newHearts({ ...INITIAL_LIKES, lastRoomTotal: 100 }, 5, 100);
  assert.equal(repeat.hearts, 0);
  const out = addHearts(INITIAL_LIKES, PARTY_LIKES + 1, 0);
  assert.ok(out.partyStarted);
  assert.ok(out.drop);
  assert.equal(out.state.partyProgress, 1);
  assert.equal(addHearts(INITIAL_LIKES, 50, 0).drop, false);
});

test('a full floor gives the longest-quiet spot to a newcomer', () => {
  let crowd = upsertClubber([], 'first', '', 1);
  for (let i = 0; i < SPOTS.length - 1; i++) crowd = upsertClubber(crowd, `p${i}`, '', 10 + i);
  assert.equal(crowd.length, SPOTS.length);
  const { evict } = pickSpot(crowd);
  assert.equal(evict?.name, 'first');
});

test('a gift is thanked once per combo, ahead of greetings, and calls the giver to the stage', () => {
  const { clock, speech, session } = makeSession();
  session.join({ id: 'a', name: 'Lan', avatar: '' });
  session.gift({ id: 'b', name: 'Minh', avatar: '', giftName: 'Rose', coinsEach: 1, count: 1 });
  session.gift({ id: 'b', name: 'Minh', avatar: '', giftName: 'Rose', coinsEach: 1, count: 3 });
  assert.equal(speech.lines.filter((l) => l.priority).length, 1);
  assert.match(speech.lines[0].text, /Minh/);
  assert.equal(session.getState().stageCalls.length, 2);
  assert.equal(session.getState().leaders[0].points, 40);
  clock.advance(4000);
  assert.ok(speech.lines.some((l) => /Lan/.test(l.text)), 'newcomer greeted');
  clock.advance(5000);
  assert.equal(realCount(session.getState().crowd), 2, 'joiner reaches the floor');
});

test('keyword sends a viewer up at most once a minute', () => {
  const { clock, session } = makeSession();
  const say = (text: string) => session.chat({ id: 'x', name: 'Huy', avatar: '', text });
  say('quẩy');
  say('quẩy');
  assert.equal(session.getState().stageCalls.length, 1);
  clock.advance(61_000);
  say('QUẨY');
  assert.equal(session.getState().stageCalls.length, 2);
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

test('the floor is filled to 12 with bots, real people replace them, more than 12 real means no bots', () => {
  let crowd = balanceBots([], 0);
  assert.equal(crowd.length, MIN_CROWD);
  assert.ok(crowd.every((c) => c.bot));
  const spots = new Set(crowd.map((c) => c.spot));
  assert.equal(spots.size, MIN_CROWD, 'bots stand on different spots');
  for (let i = 0; i < 5; i++) {
    crowd = balanceBots(upsertClubber(crowd, `p${i}`, '', i), i);
    assert.equal(crowd.length, MIN_CROWD, 'total stays 12 while real people join');
    assert.equal(realCount(crowd), i + 1);
  }
  for (let i = 5; i < 12; i++) crowd = balanceBots(upsertClubber(crowd, `p${i}`, '', i), i);
  assert.equal(crowd.filter((c) => c.bot).length, 0, 'bots gone at 12 real people');
  crowd = balanceBots(upsertClubber(crowd, 'p12', '', 12), 12);
  assert.equal(crowd.length, 13, 'the 13th person is simply added');
});

test('a session starts with bots, and bots never reach the TOP board or the stage', () => {
  const { session } = makeSession();
  assert.equal(session.getState().crowd.filter((c) => c.bot).length, MIN_CROWD);
  session.chat({ id: 'x', name: 'Huy', avatar: '', text: 'quẩy' });
  const crowd = session.getState().crowd;
  assert.equal(crowd.length, MIN_CROWD);
  assert.equal(realCount(crowd), 1);
  assert.deepEqual(session.getState().leaders.map((l) => l.name), ['Huy']);
});

test('share reminder: the button reads no names, the timer names only real people (never test buttons)', () => {
  const { clock, speech, session } = makeSession();
  clock.advance(60_000);
  session.chat({ id: 'r', name: 'Thu Hà', avatar: '', text: 'hello' });
  session.command({ action: 'testGift', name: 'Đại Gia Test', coins: 199 });
  session.command({ action: 'testComment', name: 'Khách Test', text: 'quẩy' });
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

test('animal skins: only a comment that is exactly one of the words counts', async () => {
  const { animalFromComment } = await import('../src/domain/animalSkins');
  assert.equal(animalFromComment('Mèo'), 'cat');
  assert.equal(animalFromComment(' MEO! '), 'cat');
  assert.equal(animalFromComment('Hươu cao cổ'), 'giraffe');
  assert.equal(animalFromComment('hươu'), 'deer');
  assert.equal(animalFromComment('Polar Bear'), 'polar');
  assert.equal(animalFromComment('gấu Bắc Cực'), 'polar');
  assert.equal(animalFromComment('toi thich meo'), null);
  assert.equal(animalFromComment('mèo mèo'), null);
});

test('a comment with an animal word changes that viewer\'s skin', () => {
  const clock = new FakeClock();
  const session = new ClubSession(clock, { giftHit() {}, stageCall() {}, drop() {}, partyHorn() {} }, null);
  session.start();
  session.chat({ id: '1', name: 'An', avatar: '', text: 'hello' });
  session.chat({ id: '2', name: 'An', avatar: '', text: 'Panda' });
  assert.equal(session.getState().crowd.find((c) => c.key === 'an')?.skin, 'animal-panda');
});

test('"human" picks a random character-* skin and "sucvat" a random animal-* skin', async () => {
  const { skinFromComment } = await import('../src/domain/skins');
  for (let i = 0; i < 30; i++) {
    assert.match(skinFromComment('human')!, /^character-[a-r]$/);
    assert.match(skinFromComment(' Người! ')!, /^character-[a-r]$/);
    for (const word of ['thuvat', 'Thú Vật!', 'ANIMAL', ' động vật '])
      assert.match(skinFromComment(word)!, /^animal-[a-z]+$/);
  }
  assert.equal(skinFromComment('sucvat'), null);
  assert.equal(skinFromComment('animal cat'), null);
  assert.equal(skinFromComment('human human'), null);
  assert.equal(skinFromComment('toi la human'), null);
});

test('typing human then sucvat swaps the viewer between character and animal', () => {
  const clock = new FakeClock();
  const session = new ClubSession(clock, { giftHit() {}, stageCall() {}, drop() {}, partyHorn() {} }, null);
  session.start();
  session.chat({ id: '1', name: 'An', avatar: '', text: 'hello' });
  session.chat({ id: '2', name: 'An', avatar: '', text: 'human' });
  assert.match(session.getState().crowd.find((c) => c.key === 'an')!.skin, /^character-/);
  session.chat({ id: '3', name: 'An', avatar: '', text: 'thuvat' });
  assert.match(session.getState().crowd.find((c) => c.key === 'an')!.skin, /^animal-/);
});

test('standing spots keep a minimum distance and there are enough of them', () => {
  assert.ok(SPOTS.length >= MIN_CROWD + 4, `only ${SPOTS.length} spots`);
  for (let i = 0; i < SPOTS.length; i++) {
    for (let j = i + 1; j < SPOTS.length; j++) {
      assert.ok(Math.hypot(SPOTS[i].x - SPOTS[j].x, SPOTS[i].z - SPOTS[j].z) >= MIN_SPOT_GAP, `spots ${i} and ${j} too close`);
    }
  }
});

test('one like puts a viewer on the stage, a like cooldown applies, and the keyword still works right after a like', () => {
  const clock = new FakeClock();
  const session = new ClubSession(clock, { giftHit() {}, stageCall() {}, drop() {}, partyHorn() {} }, null);
  session.start();
  const like = () => session.like({ name: 'An', count: 1, totalLikes: 0 });
  like();
  assert.equal(session.getState().stageCalls.length, 1);
  assert.equal(session.getState().stageCalls[0].gift, undefined);
  like();
  like();
  assert.equal(session.getState().stageCalls.length, 1);
  // a heart does not block the keyword
  session.chat({ id: 'k', name: 'An', avatar: '', text: 'quẩy' });
  assert.equal(session.getState().stageCalls.length, 2);
  clock.advance(61_000);
  like();
  assert.equal(session.getState().stageCalls.length, 3);
});

test('wander targets stay near home, on the floor, and away from other people', async () => {
  const { pickWanderTarget, WANDER_RADIUS, WANDER_MIN_GAP } = await import('../src/domain/wander');
  const home = { x: 1.5, z: 0 };
  const other = { x: 2.2, z: 0 };
  for (let i = 0; i < 200; i++) {
    const t = pickWanderTarget(home, home, [other]);
    if (!t) continue;
    assert.ok(Math.hypot(t.x - home.x, t.z - home.z) <= WANDER_RADIUS + 1e-9);
    assert.ok(Math.hypot(t.x - other.x, t.z - other.z) >= WANDER_MIN_GAP);
  }
  // boxed in on every side: nowhere to go
  const ring = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dz) => ({ x: home.x + dx * 0.3, z: dz * 0.3 }))).filter((p) => p.x !== home.x || p.z !== 0);
  assert.equal(pickWanderTarget(home, home, ring), null);
});

test('people who join the floor start as a random mix of humans and animals', async () => {
  const { balanceBots } = await import('../src/domain/dancefloor');
  const kinds = new Set<string>();
  for (let i = 0; i < 20; i++) for (const c of balanceBots([], 0)) kinds.add(c.skin.split('-')[0]);
  assert.deepEqual([...kinds].sort(), ['animal', 'character']);
});
