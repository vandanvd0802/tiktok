/**
 * Club music and sound effects made with Web Audio (no audio files, nothing to license): a 124 BPM house loop
 * (kick, clap, hats, bass, chord stabs), a busier "party" mode, a beat drop, and gift / stage sounds.
 * The music ducks while the voice speaks. Also the beat clock the 3D dancers move to.
 */
import type { GiftTier } from '../domain/gifts';
import type { SoundEffects } from '../application/ports';

export interface BeatClock {
  beat(): number; // beats since start, fractional
}

const BPM = 124;
const SECONDS_PER_BEAT = 60 / BPM;
const LOOKAHEAD_S = 0.12;
const SCHEDULE_EVERY_MS = 25;
const DUCK_LEVEL = 0.35;

// Am – F – C – G, one chord per bar (bass roots in Hz, chord tones an octave up)
const PROGRESSION = [
  { root: 55.0, chord: [220.0, 261.63, 329.63] },
  { root: 43.65, chord: [174.61, 220.0, 261.63] },
  { root: 65.41, chord: [196.0, 261.63, 329.63] },
  { root: 49.0, chord: [196.0, 246.94, 293.66] },
];

export class ClubAudioEngine implements SoundEffects, BeatClock {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private fxGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer: number | null = null;
  private startedAt = 0; // ctx time of beat 0
  private nextStep = 0; // next 16th note to schedule
  private musicOn = false;
  private volume = 0.35;
  private ducked = false;
  private party = false;
  private readonly wallStart = performance.now();

  constructor() {
    // Browsers keep audio locked until the first click; LIVE Studio usually allows it straight away
    const unlock = () => {
      void this.context()?.resume();
      if (this.ctx?.state === 'running') ['click', 'keydown', 'touchstart'].forEach((e) => window.removeEventListener(e, unlock));
    };
    ['click', 'keydown', 'touchstart'].forEach((e) => window.addEventListener(e, unlock));
  }

  // --- public controls --------------------------------------------------------
  setMusic(on: boolean, volume: number) {
    this.volume = volume;
    this.musicOn = on;
    const ctx = this.context();
    if (!ctx) return;
    this.applyMusicLevel();
    if (on && this.timer === null) {
      this.startedAt = ctx.currentTime + 0.1;
      this.nextStep = 0;
      this.timer = window.setInterval(() => this.schedule(), SCHEDULE_EVERY_MS);
    } else if (!on && this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  setParty(on: boolean) {
    this.party = on;
  }

  duck(on: boolean) {
    this.ducked = on;
    this.applyMusicLevel();
  }

  beat(): number {
    if (this.ctx && this.timer !== null) return Math.max(0, (this.ctx.currentTime - this.startedAt) / SECONDS_PER_BEAT);
    return (performance.now() - this.wallStart) / 1000 / SECONDS_PER_BEAT;
  }

  // --- SoundEffects -------------------------------------------------------------
  giftHit(tier: GiftTier) {
    const ctx = this.context();
    if (!ctx || !this.fxGain) return;
    const t = ctx.currentTime + 0.01;
    const notes = tier === 'small' ? [1046.5, 1318.5] : [1046.5, 1318.5, 1568, 2093];
    notes.forEach((f, i) => this.tone(f, t + i * 0.07, 0.25, 'triangle', 0.18));
    if (tier === 'big' || tier === 'huge') this.airHorn(t + 0.3, tier === 'huge' ? 3 : 1);
  }

  stageCall() {
    const ctx = this.context();
    if (!ctx) return;
    this.sweep(ctx.currentTime + 0.01, 0.5, 400, 4000, 0.12);
  }

  drop() {
    const ctx = this.context();
    if (!ctx) return;
    const t = ctx.currentTime + 0.01;
    this.sweep(t, 1.2, 300, 8000, 0.14); // riser
    this.kick(t + 1.25, 1.4);
    this.crash(t + 1.25, 0.25);
  }

  partyHorn() {
    const ctx = this.context();
    if (!ctx) return;
    this.airHorn(ctx.currentTime + 0.05, 3);
  }

  // --- engine -------------------------------------------------------------------
  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window === 'undefined' || !window.AudioContext) return null;
    const ctx = new AudioContext();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.musicGain = ctx.createGain();
    this.musicGain.connect(comp);
    this.fxGain = ctx.createGain();
    this.fxGain.gain.value = 0.9;
    this.fxGain.connect(comp);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.ctx = ctx;
    return ctx;
  }

  private applyMusicLevel() {
    if (!this.ctx || !this.musicGain) return;
    const level = this.musicOn ? this.volume * (this.ducked ? DUCK_LEVEL : 1) : 0;
    this.musicGain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.12);
  }

  private schedule() {
    const ctx = this.ctx!;
    const stepLength = SECONDS_PER_BEAT / 4;
    while (this.startedAt + this.nextStep * stepLength < ctx.currentTime + LOOKAHEAD_S) {
      this.playStep(this.nextStep, this.startedAt + this.nextStep * stepLength);
      this.nextStep++;
    }
  }

  private playStep(step: number, t: number) {
    const inBeat = step % 4;
    const beatInBar = Math.floor(step / 4) % 4;
    const bar = Math.floor(step / 16);
    const { root, chord } = PROGRESSION[bar % PROGRESSION.length];
    const out = this.musicGain!;
    if (inBeat === 0) this.kick(t, 1, out);
    if (inBeat === 0 && (beatInBar === 1 || beatInBar === 3)) this.clap(t, out);
    if (inBeat === 2) this.hat(t, 0.09, 0.22, out); // open hat on the off-beat
    if (this.party && inBeat % 2 === 1) this.hat(t, 0.03, 0.12, out);
    if (inBeat === 2 || (this.party && inBeat === 3)) this.bass(t, root, out);
    if (step % 16 === 6 || step % 16 === 14) this.stab(t, chord, out);
    if (this.party && inBeat === 0) this.tone(chord[(step / 4) % 3] * 2, t, 0.14, 'square', 0.035, out);
  }

  private kick(t: number, level = 1, out: AudioNode = this.fxGain!) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.9 * level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  private noiseBurst(t: number, length: number, level: number, filter: BiquadFilterType, freq: number, out: AudioNode) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + length);
    src.connect(f).connect(g).connect(out);
    src.start(t);
    src.stop(t + length + 0.02);
  }

  private hat(t: number, length: number, level: number, out: AudioNode) {
    this.noiseBurst(t, length, level, 'highpass', 7500, out);
  }

  private clap(t: number, out: AudioNode) {
    this.noiseBurst(t, 0.16, 0.35, 'bandpass', 1600, out);
  }

  private crash(t: number, level: number) {
    this.noiseBurst(t, 1.6, level, 'highpass', 5000, this.fxGain!);
  }

  private bass(t: number, freq: number, out: AudioNode) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = this.party ? 900 : 420;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.32, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + SECONDS_PER_BEAT * 0.45);
    osc.connect(f).connect(g).connect(out);
    osc.start(t);
    osc.stop(t + SECONDS_PER_BEAT * 0.5);
  }

  private stab(t: number, chord: number[], out: AudioNode) {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(this.party ? 3200 : 1800, t);
    f.frequency.exponentialRampToValueAtTime(500, t + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.09, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    f.connect(g).connect(out);
    for (const freq of chord) {
      for (const detune of [-8, 8]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        osc.detune.value = detune;
        osc.connect(f);
        osc.start(t);
        osc.stop(t + 0.26);
      }
    }
  }

  private tone(freq: number, t: number, length: number, type: OscillatorType, level: number, out: AudioNode = this.fxGain!) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + length);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + length + 0.02);
  }

  private sweep(t: number, length: number, from: number, to: number, level: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 4;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + length);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(level, t + length * 0.9);
    g.gain.exponentialRampToValueAtTime(0.001, t + length + 0.05);
    src.connect(f).connect(g).connect(this.fxGain!);
    src.start(t);
    src.stop(t + length + 0.1);
  }

  private airHorn(t: number, blasts: number) {
    const ctx = this.ctx!;
    for (let b = 0; b < blasts; b++) {
      const start = t + b * 0.28;
      const len = b === blasts - 1 ? 0.55 : 0.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.09, start + 0.02);
      g.gain.setValueAtTime(0.09, start + len - 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, start + len);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 2600;
      f.connect(g).connect(this.fxGain!);
      for (const freq of [466.16, 469, 932.33]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        osc.connect(f);
        osc.start(start);
        osc.stop(start + len + 0.02);
      }
    }
  }
}

/** Beat clock without any audio, for the silent dashboard preview. */
export class WallClockBeats implements BeatClock {
  private readonly start = performance.now();
  beat() {
    return (performance.now() - this.start) / 1000 / SECONDS_PER_BEAT;
  }
}

/** For pages that must stay silent (the dashboard). */
export class SilentEffects implements SoundEffects {
  giftHit() {}
  stageCall() {}
  drop() {}
  partyHorn() {}
}
