/** Custom stage background: one image kept in uploads/, served at /uploads/<file>. */
import fs from 'fs';
import path from 'path';
import type { BackgroundImageStore } from '../../application/ports';

const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export class UploadedBackgroundStore implements BackgroundImageStore {
  static readonly CONTENT_TYPES = Object.keys(EXTENSIONS);

  constructor(
    private readonly dir: string,
    private readonly publicPrefix = '/uploads'
  ) {}

  accepts(contentType: string): boolean {
    return contentType in EXTENSIONS;
  }

  save(bytes: Buffer, contentType: string): string {
    const ext = EXTENSIONS[contentType];
    if (!ext) throw new Error('Chỉ nhận ảnh JPG, PNG hoặc WebP');
    fs.mkdirSync(this.dir, { recursive: true });
    const file = `background-${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(this.dir, file), bytes);
    return `${this.publicPrefix}/${file}`;
  }

  remove(url: string): void {
    if (!url.startsWith(this.publicPrefix + '/')) return;
    const file = path.join(this.dir, path.basename(url));
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}
