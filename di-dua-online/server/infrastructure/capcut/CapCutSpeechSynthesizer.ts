import type { SpeechSynthesizer } from '../../application/ports';
import type { CapCutTtsClient } from './CapCutTtsClient';
import type { CapCutVoiceCatalog } from './capcutVoices';

// CapCut answers "ExceededQPSQuota" when lines are requested too fast in a row; waiting a moment fixes it
const RATE_LIMIT = /QPS|quota|busy|1014/i;
const RETRY_DELAYS_MS = [700, 1500];

export class CapCutSpeechSynthesizer implements SpeechSynthesizer {
  readonly name = 'capcut';

  constructor(
    private readonly client: CapCutTtsClient,
    private readonly voices: CapCutVoiceCatalog
  ) {}

  async synthesize(text: string, voiceId: string): Promise<Buffer> {
    const voice = this.voices.resolve(voiceId);
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.client.synthesize(text, voice);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (attempt >= RETRY_DELAYS_MS.length || !RATE_LIMIT.test(message)) throw err;
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      }
    }
  }
}
