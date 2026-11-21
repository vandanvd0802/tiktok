/**
 * Turns text into MP3 for the stage page: tries each synthesizer in order (CapCut first, Edge as a fallback).
 * Lookup order: recent lines in memory, then the disk cache, then a real synthesis (saved to both). One request
 * is shared between callers asking for the same line at once. `warm` synthesises a list of lines ahead of time,
 * one at a time, so lines the MC says over and over are ready before they are needed.
 */
import type { AudioCache, SpeechSynthesizer } from './ports';

export type WarmOptions = { gapMs: number };

export class SpeechService {
  private readonly cache = new Map<string, Buffer>();
  private readonly inFlight = new Map<string, Promise<Buffer>>();
  private warmRun = 0; // a newer warm-up stops the older one

  constructor(
    private readonly synthesizers: SpeechSynthesizer[],
    private readonly cacheEntries: number,
    private readonly maxChars: number,
    private readonly disk: AudioCache | null = null,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
  ) {
    if (!synthesizers.length) throw new Error('SpeechService needs at least one synthesizer');
  }

  normalize(text: string): string {
    // NFC: the same Vietnamese letter can arrive precomposed or with combining marks; one cache key for both
    return text.normalize('NFC').replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, this.maxChars);
  }

  async speak(rawText: string, voiceId: string): Promise<Buffer> {
    const text = this.normalize(rawText);
    if (!text) throw new Error('Empty text');
    const key = `${voiceId}|${text}`;
    const cached = this.cache.get(key);
    if (cached) {
      // refresh its place in the LRU order
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }
    let pending = this.inFlight.get(key);
    if (!pending) {
      pending = this.load(key, text, voiceId).finally(() => this.inFlight.delete(key));
      this.inFlight.set(key, pending);
    }
    const audio = await pending;
    this.remember(key, audio);
    return audio;
  }

  /**
   * Makes sure every line is on disk in this voice; lines already there cost nothing. Runs in the background,
   * `gapMs` apart so CapCut is not flooded. Returns how many lines it had to synthesise.
   */
  async warm(lines: string[], voiceId: string, { gapMs }: WarmOptions): Promise<number> {
    const run = ++this.warmRun;
    const texts = [...new Set(lines.map((l) => this.normalize(l)).filter(Boolean))];
    let made = 0;
    for (const text of texts) {
      if (run !== this.warmRun) break;
      const key = `${voiceId}|${text}`;
      if (this.cache.has(key) || (await this.disk?.has(key))) continue;
      try {
        await this.speak(text, voiceId);
        made++;
      } catch (err) {
        console.warn('[TTS] warm-up skipped a line:', err instanceof Error ? err.message : err);
      }
      await this.sleep(gapMs);
    }
    return made;
  }

  private async load(key: string, text: string, voiceId: string): Promise<Buffer> {
    const saved = await this.disk?.get(key);
    if (saved) return saved;
    const audio = await this.synthesizeWithFallback(text, voiceId);
    if (audio.fromFallback) return audio.bytes; // the stand-in voice is not kept: CapCut gets another try next time
    await this.disk?.put(key, audio.bytes);
    return audio.bytes;
  }

  private async synthesizeWithFallback(text: string, voiceId: string): Promise<{ bytes: Buffer; fromFallback: boolean }> {
    const errors: string[] = [];
    for (const [i, synth] of this.synthesizers.entries()) {
      try {
        return { bytes: await synth.synthesize(text, voiceId), fromFallback: i > 0 };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${synth.name}: ${message}`);
        console.warn(`[TTS] ${synth.name} failed, trying next:`, message);
      }
    }
    throw new Error(`All TTS providers failed (${errors.join(' | ')})`);
  }

  private remember(key: string, audio: Buffer) {
    this.cache.set(key, audio);
    while (this.cache.size > this.cacheEntries) this.cache.delete(this.cache.keys().next().value!);
  }
}
