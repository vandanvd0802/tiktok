/**
 * Synthesised voice lines kept on disk (<dataDir>/tts-cache/<sha1>.mp3) so a line said once is never sent to
 * CapCut again, even after a restart. Reading a file touches it; past `maxFiles` the least recently used go.
 */
import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import type { AudioCache } from '../../application/ports';

const PRUNE_EVERY_WRITES = 50;

export class FileAudioCache implements AudioCache {
  private writes = 0;
  private ready: Promise<unknown>;

  constructor(
    private readonly dir: string,
    private readonly maxFiles: number
  ) {
    this.ready = fs.mkdir(dir, { recursive: true });
  }

  private file(key: string) {
    return path.join(this.dir, `${createHash('sha1').update(key).digest('hex')}.mp3`);
  }

  async has(key: string): Promise<boolean> {
    await this.ready;
    return fs.access(this.file(key)).then(
      () => true,
      () => false
    );
  }

  async get(key: string): Promise<Buffer | null> {
    await this.ready;
    const file = this.file(key);
    try {
      const audio = await fs.readFile(file);
      const now = new Date();
      fs.utimes(file, now, now).catch(() => {}); // LRU order only: a failed touch changes nothing else
      return audio.length ? audio : null;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('[TTS cache] read failed:', (err as Error).message);
      return null;
    }
  }

  async put(key: string, audio: Buffer): Promise<void> {
    await this.ready;
    const file = this.file(key);
    const tmp = `${file}.${process.pid}.tmp`;
    try {
      await fs.writeFile(tmp, audio);
      await fs.rename(tmp, file); // never leave a half-written mp3 behind
    } catch (err) {
      console.warn('[TTS cache] write failed:', (err as Error).message);
      await fs.rm(tmp, { force: true });
      return;
    }
    if (++this.writes % PRUNE_EVERY_WRITES === 0) await this.prune();
  }

  private async prune() {
    try {
      const names = (await fs.readdir(this.dir)).filter((n) => n.endsWith('.mp3'));
      if (names.length <= this.maxFiles) return;
      const stats = await Promise.all(names.map(async (n) => ({ n, t: (await fs.stat(path.join(this.dir, n))).mtimeMs })));
      stats.sort((a, b) => a.t - b.t);
      await Promise.all(stats.slice(0, stats.length - this.maxFiles).map((s) => fs.rm(path.join(this.dir, s.n), { force: true })));
    } catch (err) {
      console.warn('[TTS cache] prune failed:', (err as Error).message);
    }
  }
}
