/** MC: pick the voice, type any line for the MC to say right away, resend recent lines. */
import { useEffect, useState } from 'react';
import type { StageSettings, VoiceOption } from '../../../shared/contracts';
import { dashboardApi } from '../../infrastructure/dashboardApi';
import { inputCls, Panel, primary, secondary, Select, Slider, type SaveSettings, type SendCommand } from './controls';

const RECENT_KEY = 'dbo.recentLines';
const MAX_RECENT = 6;

// Per-browser convenience only: losing it (private window, cleared data) just empties the list
function loadRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string').slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function saveRecent(lines: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(lines));
  } catch {
    // storage blocked: the list just isn't kept
  }
}

export function McPanel({ settings, onSave, onSend }: { settings: StageSettings; onSave: SaveSettings; onSend: SendCommand }) {
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [text, setText] = useState('');
  const [recent, setRecent] = useState<string[]>(loadRecent);

  useEffect(() => {
    dashboardApi.voices().then(setVoices, (err) => console.error('[dashboard] cannot load voices', err));
  }, []);

  const speak = async (line: string) => {
    const clean = line.trim();
    if (!clean) return;
    if (!(await onSend({ action: 'speak', text: clean }, 'MC đang đọc trên live'))) return;
    const next = [clean, ...recent.filter((r) => r !== clean)].slice(0, MAX_RECENT);
    setRecent(next);
    saveRecent(next);
    setText('');
  };

  return (
    <Panel title="MC">
      <Select
        label="Giọng MC"
        value={settings.voiceId}
        options={voices.map((v) => ({ value: v.id, label: v.name }))}
        onChange={(voiceId) => onSave({ voiceId })}
      />
      <label className="flex flex-col gap-1">
        <span className="text-xs text-white/60">MC nói câu này ngay (Enter để gửi, Shift+Enter xuống dòng)</span>
        <textarea
          className={`${inputCls} min-h-[70px] resize-y`}
          placeholder="Ví dụ: Cả nhà thả tim cho DJ nào!"
          maxLength={400}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void speak(text);
            }
          }}
        />
      </label>
      <div className="flex gap-2 flex-wrap">
        <button className={primary} disabled={!text.trim()} onClick={() => void speak(text)}>
          🎤 MC nói
        </button>
        <button className={secondary} onClick={() => void onSend({ action: 'shareReminder' })}>
          Nhắc chia sẻ
        </button>
      </div>
      {recent.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-white/50">Câu đã nói (bấm để nói lại)</span>
          {recent.map((line) => (
            <button key={line} className="text-left text-xs rounded-md bg-black/30 hover:bg-white/10 px-2 py-1.5 truncate" title={line} onClick={() => void speak(line)}>
              {line}
            </button>
          ))}
        </div>
      )}
      <Slider label="Tốc độ đọc" value={settings.voiceRate} min={0.8} max={1.6} step={0.05} format={(v) => `${v.toFixed(2)}x`} onCommit={(v) => onSave({ voiceRate: v })} />
    </Panel>
  );
}
