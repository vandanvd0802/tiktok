/** Small form controls shared by the dashboard panels. */
import { useEffect, useState, type ReactNode } from 'react';

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-fuchsia-500/25 bg-[#120a1f]/90 p-4 shadow-[0_0_24px_rgba(155,77,255,0.12)]">
      <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-fuchsia-300 mb-3">{title}</h3>
      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  );
}

export const inputCls = 'flex-1 min-w-0 rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-cyan-400';
export const btnCls = 'rounded-lg px-3 py-2 text-sm font-bold transition-colors disabled:opacity-40';
export const primary = `${btnCls} bg-fuchsia-600 hover:bg-fuchsia-500 text-white`;
export const secondary = `${btnCls} bg-white/10 hover:bg-white/20 text-white`;

export function TextSetting({ label, value, onSave, max }: { label: string; value: string; onSave: (v: string) => void; max: number }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-white/60">{label}</span>
      <div className="flex gap-2">
        <input className={inputCls} value={draft} maxLength={max} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onSave(draft)} />
        <button className={secondary} disabled={!draft.trim() || draft === value} onClick={() => onSave(draft)}>
          Lưu
        </button>
      </div>
    </label>
  );
}

export function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className="flex items-center justify-between rounded-lg bg-black/30 px-3 py-2 text-sm" onClick={() => onChange(!on)}>
      <span>{label}</span>
      <span className={`w-10 h-5 rounded-full relative transition-colors ${on ? 'bg-cyan-500' : 'bg-white/20'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? 'left-5.5' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

export function Slider({ label, value, min, max, step, format, onCommit }: { label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className="flex items-center gap-3 text-sm">
      <span className="w-28 text-white/70">{label}</span>
      <input
        type="range"
        className="flex-1 accent-fuchsia-500"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={() => onCommit(draft)}
        onKeyUp={() => onCommit(draft)}
      />
      <span className="w-12 text-right tabular-nums text-white/80">{format(draft)}</span>
    </label>
  );
}

export function Select({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-white/60">{label}</span>
      <select className={`${inputCls} cursor-pointer [&>option]:bg-[#120a1f]`} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export type SaveSettings = (patch: Partial<import('../../../shared/contracts').StageSettings>) => Promise<boolean>;
export type SendCommand = (cmd: import('../../../shared/contracts').StageCommand, done?: string) => Promise<boolean>;
