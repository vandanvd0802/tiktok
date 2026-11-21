/**
 * Turns text into MP3 for the stage page: tries each synthesizer in order (CapCut first, Edge as a fallback),
 * keeps recent results in memory and shares one request between callers asking for the same line at once.
 */
import type { SpeechSynthesizer } from './ports';

export class SpeechService {
  private readonly cache = new Map<string, Buffer>();
  private readonly inFlight = new Map<string, Promise<Buffer>>();

  constructor(
    private readonly synthesizers: SpeechSynthesizer[],
    private readonly cacheEntries: number,
    private readonly maxChars: number
  ) {
    if (!synthesizers.length) throw new Error('SpeechService needs at least one synthesizer');
  }

  normalize(text: string): string {
    return text.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, this.maxChars);
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
      pending = this.synthesizeWithFallback(text, voiceId).finally(() => this.inFlight.delete(key));
      this.inFlight.set(key, pending);
    }
    const audio = await pending;
    this.remember(key, audio);
    return audio;
  }

  private async synthesizeWithFallback(text: string, voiceId: string): Promise<Buffer> {
    const errors: string[] = [];
    for (const synth of this.synthesizers) {
      try {
        return await synth.synthesize(text, voiceId);
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
