/** Background music: built-in beat, one song from public/audio on repeat, or all songs in turn. */
import { useCallback, useEffect, useState } from 'react';
import { ALL_TRACKS, BUILT_IN_BEAT, type MusicOption, type StageSettings } from '../../../shared/contracts';
import { dashboardApi } from '../../infrastructure/dashboardApi';
import { Panel, secondary, Select, Slider, Toggle, type SaveSettings } from './controls';

export function MusicPanel({ settings, onSave }: { settings: StageSettings; onSave: SaveSettings }) {
  const [tracks, setTracks] = useState<MusicOption[]>([]);
  const reload = useCallback(() => {
    dashboardApi.music().then(setTracks, (err) => console.error('[dashboard] cannot list music', err));
  }, []);
  useEffect(reload, [reload]);

  const options = [
    { value: BUILT_IN_BEAT, label: '🎛️ Nhạc house tự tạo (124 BPM)' },
    ...(tracks.length ? [{ value: ALL_TRACKS, label: `🔁 Phát lần lượt tất cả (${tracks.length} bài)` }] : []),
    ...tracks.map((t) => ({ value: t.file, label: `🎵 ${t.name}` })),
  ];

  return (
    <Panel title="Nhạc & hiệu ứng">
      <Toggle label="Bật nhạc nền" on={settings.musicOn} onChange={(v) => onSave({ musicOn: v })} />
      <Select label="Bài nhạc (thư mục public/audio)" value={settings.musicTrack} options={options} onChange={(musicTrack) => onSave({ musicTrack })} />
      <Slider label="Âm lượng nhạc" value={settings.musicVolume} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onCommit={(v) => onSave({ musicVolume: v })} />
      <div className="flex gap-2 flex-wrap">
        <button className={secondary} onClick={reload}>
          ↻ Tải lại danh sách nhạc
        </button>
      </div>
      <p className="text-xs text-white/40">Chép file .mp3 vào thư mục public/audio rồi bấm "Tải lại danh sách nhạc".</p>
    </Panel>
  );
}
