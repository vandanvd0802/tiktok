/** Microsoft Edge read-aloud voice, used only when CapCut fails. */
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import type { SpeechSynthesizer } from '../../application/ports';

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export class EdgeSpeechSynthesizer implements SpeechSynthesizer {
  readonly name = 'edge';

  constructor(
    private readonly voice: string,
    private readonly timeoutMs: number
  ) {}

  // Edge has its own voices: the CapCut voice id is ignored, the fallback voice is used
  async synthesize(text: string): Promise<Buffer> {
    const tts = new MsEdgeTTS();
    let timer: NodeJS.Timeout | undefined;
    try {
      await tts.setMetadata(this.voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(escapeXml(text));
      const chunks: Buffer[] = [];
      const read = (async () => {
        for await (const c of audioStream) chunks.push(c as Buffer);
      })();
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Edge TTS timeout')), this.timeoutMs);
      });
      await Promise.race([read, timeout]);
      if (!chunks.length) throw new Error('Edge TTS returned no audio');
      return Buffer.concat(chunks);
    } finally {
      clearTimeout(timer);
      tts.close();
    }
  }
}
