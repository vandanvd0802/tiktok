/** Music the owner drops into public/audio, served at /audio/<file>. Re-read on every call so new files show up. */
import fs from 'fs';
import path from 'path';
import type { MusicOption } from '../../../shared/contracts';
import type { MusicLibrary } from '../../application/ports';

const AUDIO = /\.(mp3|m4a|aac|ogg|oga|wav|webm)$/i;

// "directtodreams-moonlight-sonata-beethoven-remix-265909.mp3" -> "directtodreams moonlight sonata beethoven remix"
const prettyName = (file: string) =>
  file
    .replace(AUDIO, '')
    .replace(/[-_ ]\d{4,}$/, '')
    .replace(/[-_]+/g, ' ')
    .trim();

export class AudioFolderLibrary implements MusicLibrary {
  constructor(private readonly dir: string) {}

  list(): MusicOption[] {
    if (!fs.existsSync(this.dir)) return [];
    try {
      return fs
        .readdirSync(this.dir)
        .filter((f) => AUDIO.test(f) && fs.statSync(path.join(this.dir, f)).isFile())
        .sort((a, b) => a.localeCompare(b))
        .map((file) => ({ file, name: prettyName(file) }));
    } catch (err) {
      console.error(`[music] cannot read ${this.dir}:`, err);
      return [];
    }
  }

  has(file: string): boolean {
    return this.list().some((m) => m.file === file);
  }
}
