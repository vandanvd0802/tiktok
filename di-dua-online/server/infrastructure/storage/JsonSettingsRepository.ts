import fs from 'fs';
import type { StageSettings } from '../../../shared/contracts';
import type { SettingsRepository } from '../../application/ports';

export class JsonSettingsRepository implements SettingsRepository {
  constructor(private readonly file: string) {}

  load(): Partial<StageSettings> {
    if (!fs.existsSync(this.file)) return {};
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (err) {
      console.error(`[settings] ${this.file} is not valid JSON, using defaults:`, err);
      return {};
    }
  }

  save(settings: StageSettings): void {
    try {
      fs.writeFileSync(this.file, JSON.stringify(settings, null, 2));
    } catch (err) {
      console.error(`[settings] could not save ${this.file}:`, err);
    }
  }
}
