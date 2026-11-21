/**
 * Vietnamese CapCut voices the MC can use (from capcut-tts-api's Voice.json; effect voices like demon/robot left
 * out). Samples of each: giong-mau/index.html. The id is CapCut's voice_type.
 */
import type { VoiceOption } from '../../../shared/contracts';
import type { VoiceCatalog } from '../../application/ports';
import type { CapCutVoice } from './CapCutTtsClient';

type Entry = VoiceOption & { resourceId: string };

const VOICES: Entry[] = [
  { id: 'BV075_streaming', resourceId: '7102355803792740865', name: 'Thanh Niên Tự Tin (nam)' },
  { id: 'BV560_streaming', resourceId: '7483736167565758992', name: 'Alex Đại Đế (nam, mạnh)' },
  { id: 'multi_male_felipe_uranus_bigtts', resourceId: '7637456729696996628', name: 'Giọng Nam Trầm' },
  { id: 'multi_female_xinwenjieshuo_uranus_bigtts', resourceId: '7637455039719640327', name: 'Nam Bản Tin' },
  { id: 'BV074_streaming', resourceId: '7102355709945188865', name: 'Cô Gái Hoạt Ngôn (nữ, sôi nổi)' },
  { id: 'multi_female_yangguangnv_uranus_bigtts', resourceId: '7637456432522218773', name: 'Ban Mai (nữ, tươi sáng)' },
  { id: 'multi_female_kiwi_uranus_bigtts', resourceId: '7637457995882089749', name: 'Sunny Idol (nữ, nhí nhảnh)' },
  { id: 'multi_female_peiqi_uranus_bigtts', resourceId: '7637458789033151751', name: 'Gái Mới Lớn (nữ, tinh nghịch)' },
  { id: 'BV421_vivn_streaming', resourceId: '7252594014782755330', name: 'Nhỏ Ngọt Ngào (nữ)' },
  { id: 'multi_female_tianmeijieshuo_uranus_bigtts', resourceId: '7637460417295469832', name: 'Nữ Kể Chuyện Ngọt' },
  { id: 'BV562_streaming', resourceId: '7483736254694035984', name: 'Mai (nữ, nhẹ nhàng)' },
  { id: 'vi_female_huong', resourceId: '7264854897953083905', name: 'Giọng Nữ Phổ Thông' },
  { id: 'multi_female_richgirl_uranus_bigtts', resourceId: '7637460351541447956', name: 'Review Phim (nữ, sang chảnh)' },
  { id: 'multi_female_daqi_uranus_bigtts', resourceId: '7637451983389019409', name: 'Review Phim 3 (nữ, mạnh)' },
  { id: 'multi_female_stokie_uranus_bigtts', resourceId: '7637456729696996628', name: 'Review Phim 4 (nữ)' },
  { id: 'multi_female_xyf04auto_uranus_bigtts', resourceId: '7637458743197732117', name: 'Review Phim 2 (nữ)' },
  { id: 'multi_female_sisi_uranus_bigtts', resourceId: '7637455857285860629', name: 'Bản Tin (nữ)' },
  { id: 'multi_female_quanweinv_uranus_bigtts', resourceId: '7637458743197732117', name: 'Bản Tin 1 (nữ)' },
];

export class CapCutVoiceCatalog implements VoiceCatalog {
  private readonly entries: Entry[];

  /** A voice set in .env (CAPCUT_VOICE / CAPCUT_RESOURCE_ID) that is not in the list is added to it. */
  constructor(extra?: CapCutVoice) {
    this.entries = [...VOICES];
    if (extra && !this.entries.some((v) => v.id === extra.voiceType)) {
      this.entries.unshift({ id: extra.voiceType, resourceId: extra.resourceId, name: `${extra.voiceType} (.env)` });
    }
  }

  list(): VoiceOption[] {
    return this.entries.map(({ id, name }) => ({ id, name }));
  }

  has(id: string): boolean {
    return this.entries.some((v) => v.id === id);
  }

  resolve(id: string): CapCutVoice {
    const entry = this.entries.find((v) => v.id === id) ?? this.entries[0];
    return { voiceType: entry.id, resourceId: entry.resourceId };
  }
}
