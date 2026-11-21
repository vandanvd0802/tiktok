/**
 * The 2D layers drawn over the 3D race: header with race status, TOP DONATE (top left), live standings (top
 * right), the waiting queue (bottom left), how-to hints, countdown and podium splashes.
 */
import { useEffect, useRef, useState } from 'react';
import type { GiftToast, HeartPulse, RaceView } from '../../application/RaceSession';
import type { ChampionEntry } from '../../domain/champions';
import type { LeaderEntry } from '../../domain/leaderboard';
import { TRACK_LENGTH } from '../../domain/race';
import type { QueueEntry } from '../../domain/raceQueue';

function Avatar({ src, name, size }: { src: string; name: string; size: number }) {
  const style = { width: size, height: size };
  if (src) return <img src={src} referrerPolicy="no-referrer" className="rounded-full object-cover shrink-0 ring-1 ring-white/60" style={style} alt="" />;
  return (
    <span className="rounded-full shrink-0 bg-orange-500 text-white font-bold flex items-center justify-center text-[9px]" style={{ ...style, fontSize: size * 0.55 }}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

const PHASE_TEXT: Record<RaceView['phase'], (r: RaceView) => string> = {
  lobby: (r) => `Lượt ${r.number + 1} bắt đầu sau ${r.secondsLeft}s`,
  countdown: (r) => `Lượt ${r.number} · chuẩn bị!`,
  racing: (r) => `Lượt ${r.number} · ${r.elapsed.toFixed(1)}s`,
  results: (r) => `Lượt ${r.number} · kết quả`,
};

export function RaceHeader({ name, race, viewers }: { name: string; race: RaceView; viewers: number }) {
  return (
    <div className="absolute top-2.5 inset-x-0 flex flex-col items-center pointer-events-none">
      <div className="race-title text-[24px] leading-none font-black tracking-wide uppercase px-4 text-center">{name}</div>
      <div className="mt-1 rounded-full bg-black/55 px-3 py-0.5 text-[11px] font-bold text-white tabular-nums">
        🏁 {PHASE_TEXT[race.phase](race)}
        {viewers > 0 && <span className="ml-2 text-white/75">👀 {viewers}</span>}
      </div>
    </div>
  );
}

const MEDALS = ['🥇', '🥈', '🥉'];

/** Top left: biggest gift givers of the live. */
export function TopDonate({ title, leaders }: { title: string; leaders: LeaderEntry[] }) {
  return (
    <div className="absolute left-2 top-[66px] w-[138px] rounded-xl bg-black/55 backdrop-blur-sm border border-amber-300/70 shadow-[0_0_14px_rgba(255,200,60,0.45)] p-1.5 pointer-events-none">
      <div className="text-center text-[10.5px] font-black tracking-widest text-amber-200 mb-1">💎 {title}</div>
      {!leaders.length && <div className="py-1 text-center text-[9.5px] font-semibold text-white/80">Tặng quà để lên bảng</div>}
      {leaders.slice(0, 4).map((l, i) => (
        <div key={l.key} className="flex items-center gap-1 h-[19px] text-[9.5px]">
          <span className="w-3.5 text-center shrink-0">{MEDALS[i] ?? <span className="text-white/60">{i + 1}</span>}</span>
          <Avatar src={l.avatar} name={l.name} size={14} />
          <span className="truncate flex-1 text-white font-semibold">{l.name}</span>
          <span className="text-amber-200 font-bold tabular-nums">{l.coins}</span>
        </div>
      ))}
    </div>
  );
}

const QUEUE_ROWS = 6;

/** Bottom left: who runs next. */
export function QueueBoard({ queue, keyword }: { queue: QueueEntry[]; keyword: string }) {
  const more = queue.length - QUEUE_ROWS;
  return (
    <div className="absolute left-2 bottom-2.5 w-[150px] rounded-xl bg-black/60 backdrop-blur-sm border border-cyan-300/60 shadow-[0_0_12px_rgba(103,232,249,0.35)] p-1.5 pointer-events-none">
      <div className="flex items-center justify-between text-[10.5px] font-black tracking-wider text-cyan-200 mb-0.5">
        <span>⏳ HÀNG CHỜ</span>
        <span className="text-white/80 tabular-nums">{queue.length}</span>
      </div>
      {!queue.length && (
        <div className="py-1 text-center text-[9.5px] font-semibold text-white/85 leading-snug">
          Gõ <span className="text-yellow-300">“{keyword}”</span> để xếp hàng
        </div>
      )}
      {queue.slice(0, QUEUE_ROWS).map((q, i) => (
        <div key={q.key} className="flex items-center gap-1 h-[18px] text-[9.5px]">
          <span className="w-3.5 text-center shrink-0 text-white/70 font-bold tabular-nums">{i + 1}</span>
          <Avatar src={q.avatar} name={q.name} size={14} />
          <span className="truncate flex-1 text-white font-semibold">{q.name}</span>
          {q.priority && <span className="text-[9px]">🎁</span>}
        </div>
      ))}
      {more > 0 && <div className="text-center text-[9px] text-white/70">… và {more} người nữa</div>}
    </div>
  );
}

/** Bottom right: the two rules of the game, big enough to read on a phone. */
export function HowToPlay({ keyword }: { keyword: string }) {
  return (
    <div className="absolute right-2 bottom-2.5 w-[170px] flex flex-col gap-1.5 pointer-events-none">
      <div className="keyword-hint rounded-xl bg-black/60 border-2 border-yellow-300/80 px-2 py-1.5 text-center text-[12px] font-black text-white leading-tight">
        Gõ <span className="text-yellow-300">“{keyword}”</span>
        <div className="text-[10.5px] font-bold text-white/90">để vào đua · 8 người/lượt</div>
      </div>
      <div className="rounded-xl bg-linear-to-r from-pink-500/90 to-orange-400/90 border-2 border-white/80 px-2 py-1.5 text-center text-[11.5px] font-black text-white leading-tight">
        🌹 Tặng quà khi đang chạy
        <div className="text-[10.5px] font-bold">= BAY qua rào 🪽</div>
      </div>
      <div className="rounded-xl bg-black/60 border-2 border-cyan-300/80 px-2 py-1 text-center text-[11px] font-black text-white leading-tight">
        Đang đua gõ <span className="text-cyan-300">“người”</span>
        <div className="text-[10.5px] font-bold text-white/90">= đổi nhân vật 🔄</div>
      </div>
    </div>
  );
}

/** Right side during a race: the running order, each runner's lane (what viewers type to cheer) and cheers. */
export function Standings({ race }: { race: RaceView }) {
  if (race.phase !== 'racing' && race.phase !== 'countdown') return null;
  return (
    <div className="absolute right-2 top-[66px] w-[150px] rounded-xl bg-black/55 backdrop-blur-sm border border-white/30 p-1 pointer-events-none">
      <div className="text-center text-[10px] font-black tracking-wider text-cyan-200 leading-tight">📣 GÕ SỐ LÀN ĐỂ CỔ VŨ</div>
      {race.standings.map((s, i) => (
        <div key={s.key} className={`flex items-center gap-1 h-[16px] text-[9px] ${s.bot ? 'text-white/65' : 'text-white'}`}>
          <span className="w-3 text-right font-black tabular-nums">{i + 1}</span>
          <span className="lane-chip">{s.lane + 1}</span>
          <span className="truncate flex-1 font-semibold">
            {s.flying ? '⚡' : s.turbo ? '🔥' : ''}
            {s.name}
          </span>
          {s.cheers > 0 && <span className="tabular-nums text-yellow-200">📣{s.cheers}</span>}
          <span className="w-6 text-right tabular-nums text-cyan-200">{Math.round((s.distance / TRACK_LENGTH) * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

/** Left, under TOP DONATE: most race wins, with the current winning streak; the crown holder first marked. */
export function Champions({ champions, crown }: { champions: ChampionEntry[]; crown: string }) {
  return (
    <div className="absolute left-2 top-[178px] w-[138px] rounded-xl bg-black/55 backdrop-blur-sm border border-yellow-300/70 shadow-[0_0_14px_rgba(255,214,10,0.4)] p-1.5 pointer-events-none">
      <div className="text-center text-[10.5px] font-black tracking-wider text-yellow-200 mb-0.5">👑 VUA ĐƯỜNG ĐUA</div>
      {!champions.length && <div className="py-0.5 text-center text-[9.5px] font-semibold text-white/80">Về nhất để lên bảng</div>}
      {champions.slice(0, 3).map((c, i) => (
        <div key={c.key} className="flex items-center gap-1 h-[19px] text-[9.5px]">
          <span className="w-3.5 text-center shrink-0">{c.key === crown ? '👑' : MEDALS[i]}</span>
          <Avatar src={c.avatar} name={c.name} size={14} />
          <span className="truncate flex-1 text-white font-semibold">{c.name}</span>
          {c.streak >= 2 && <span className="text-orange-300 font-bold">🔥{c.streak}</span>}
          <span className="text-yellow-200 font-bold tabular-nums">{c.wins}</span>
        </div>
      ))}
    </div>
  );
}

/** "SÁT NÚT!" across the screen while the finish plays in slow motion. */
export function PhotoFinish({ race }: { race: RaceView }) {
  if (!race.photoFinish) return null;
  return (
    <div className="absolute inset-0 pointer-events-none photo-finish">
      <div className="absolute inset-x-0 top-[24%] text-center text-[46px] font-black text-white race-title photo-finish-text">📸 SÁT NÚT!</div>
    </div>
  );
}

/** Big 3-2-1 in the middle while the runners wait on the line. */
export function CountdownSplash({ race }: { race: RaceView }) {
  if (race.phase !== 'countdown') return null;
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div key={race.secondsLeft} className="countdown-number text-[120px] font-black text-white">
        {race.secondsLeft}
      </div>
    </div>
  );
}

/** The first three after the race. */
export function ResultsPodium({ race }: { race: RaceView }) {
  if (race.phase !== 'results') return null;
  const podium = race.standings.slice(0, 3);
  return (
    <div className="absolute left-[152px] right-2 top-[22%] flex flex-col items-center pointer-events-none podium-in">
      <div className="text-[26px] font-black text-yellow-300 race-title">🏆 KẾT QUẢ 🏆</div>
      <div className="mt-2 w-full rounded-2xl bg-black/60 border-2 border-yellow-300/80 p-2 flex flex-col gap-1">
        {podium.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2 text-white">
            <span className="text-[22px]">{MEDALS[i]}</span>
            <Avatar src={s.avatar} name={s.name} size={26} />
            <span className="truncate flex-1 text-[15px] font-black">{s.name}</span>
          </div>
        ))}
      </div>
      <div className="mt-1.5 text-[11px] font-bold text-white/90 bg-black/50 rounded-full px-3 py-0.5">Lượt sau sau {race.secondsLeft}s</div>
    </div>
  );
}

const TOAST_STYLE: Record<GiftToast['tier'], string> = {
  small: 'from-fuchsia-600/85 to-violet-700/85',
  medium: 'from-pink-500/90 to-orange-500/90',
  big: 'from-amber-400/95 to-pink-600/95',
  huge: 'from-yellow-300 via-pink-500 to-cyan-400',
};

const BANNER_STYLE: Record<GiftToast['tier'], { text: string; box: string; flash: string }> = {
  small: { text: 'text-[26px]', box: 'from-fuchsia-600/90 to-violet-700/90', flash: 'rgba(255,45,149,0.7)' },
  medium: { text: 'text-[32px]', box: 'from-pink-500/95 to-orange-500/95', flash: 'rgba(255,160,40,0.75)' },
  big: { text: 'text-[38px]', box: 'from-amber-400 to-pink-600', flash: 'rgba(255,210,60,0.85)' },
  huge: { text: 'text-[44px]', box: 'from-yellow-300 via-pink-500 to-cyan-400', flash: 'rgba(255,255,255,0.9)' },
};

/** Big blinking "NAME GIFT x N" for the newest gift ("BAY LÊN!" when it lifts a runner); fades out by itself. */
export function GiftBanner({ toast }: { toast: GiftToast | undefined }) {
  if (!toast) return null;
  const style = BANNER_STYLE[toast.tier];
  return (
    <div key={toast.id} className="absolute inset-0 pointer-events-none overflow-hidden">
      <div className="gift-edge-flash" style={{ ['--flash' as string]: style.flash }} />
      {toast.flying && <div className="lightning-flash" />}
      <div className="gift-banner absolute inset-x-3 top-[16%] flex flex-col items-center">
        <div className={`gift-banner-box flex items-center gap-2.5 rounded-3xl px-4 py-2 bg-linear-to-r ${style.box} border-2 border-white/80`}>
          <Avatar src={toast.avatar} name={toast.name} size={toast.tier === 'small' ? 36 : 46} />
          <div className="min-w-0 text-center leading-tight">
            <div className="text-[15px] font-bold text-white truncate max-w-[250px]">{toast.name}</div>
            <div className="text-[13px] font-semibold text-white/90 tracking-widest">
              TẶNG {toast.giftName}
              {toast.count > 1 && ` x${toast.count}`}
            </div>
          </div>
        </div>
        <div className={`gift-banner-text mt-1.5 font-black uppercase text-center leading-none ${style.text}`}>{toast.flying ? '🪽 BAY LÊN! 🪽' : '⏫ LÊN ĐẦU HÀNG'}</div>
      </div>
    </div>
  );
}

export function GiftToasts({ toasts }: { toasts: GiftToast[] }) {
  return (
    <div className="absolute right-2 top-[66px] flex flex-col items-end gap-1.5 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className={`gift-toast flex items-center gap-1.5 max-w-[180px] rounded-full pl-1 pr-2.5 py-1 bg-linear-to-r ${TOAST_STYLE[t.tier]} shadow-lg`}>
          <Avatar src={t.avatar} name={t.name} size={22} />
          <div className="min-w-0 leading-tight">
            <div className="text-[10px] font-bold text-white truncate">{t.name}</div>
            <div className="text-[9px] text-white/90 truncate">
              tặng {t.giftName} {t.count > 1 ? `x${t.count}` : ''}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

type FloatingHeart = { id: number; left: number; size: number; seconds: number; drift: number; hue: string };

const HEART_COLORS = ['#ff2d95', '#ff5fa8', '#ff8ac4', '#ffffff', '#ff3d6e'];
const MAX_HEARTS = 40;
const HEARTS_PER_TAP = 6;
const HEART_LIFE_MS = 2800;
const NAME_SHOW_MS = 1800;

/** Every heart tap: hearts float up from the bottom, the screen edge flashes pink, the tapper's name pops up. */
export function HeartTaps({ pulse }: { pulse: HeartPulse }) {
  const [hearts, setHearts] = useState<FloatingHeart[]>([]);
  const [name, setName] = useState<{ seq: number; text: string } | null>(null);
  const nextId = useRef(0);

  useEffect(() => {
    if (!pulse.seq) return;
    const born = Array.from({ length: Math.min(pulse.count, HEARTS_PER_TAP) }, () => ({
      id: nextId.current++,
      left: 30 + Math.random() * 40,
      size: 16 + Math.random() * 22,
      seconds: 1.6 + Math.random() * 1.2,
      drift: (Math.random() - 0.5) * 70,
      hue: HEART_COLORS[Math.floor(Math.random() * HEART_COLORS.length)],
    }));
    setHearts((prev) => [...prev, ...born].slice(-MAX_HEARTS));
    const ids = new Set(born.map((h) => h.id));
    const gone = setTimeout(() => setHearts((prev) => prev.filter((h) => !ids.has(h.id))), HEART_LIFE_MS);
    let hideName: ReturnType<typeof setTimeout> | undefined;
    if (pulse.name) {
      setName({ seq: pulse.seq, text: pulse.name });
      hideName = setTimeout(() => setName((n) => (n?.seq === pulse.seq ? null : n)), NAME_SHOW_MS);
    }
    return () => {
      clearTimeout(gone);
      clearTimeout(hideName);
    };
  }, [pulse.seq]);

  if (!pulse.seq) return null;
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <div key={pulse.seq} className="heart-edge-flash" />
      {hearts.map((h) => (
        <span
          key={h.id}
          className="floating-heart"
          style={{ left: `${h.left}%`, fontSize: h.size, color: h.hue, animationDuration: `${h.seconds}s`, ['--drift' as string]: `${h.drift}px` }}
        >
          ♥
        </span>
      ))}
      {name && (
        <div key={name.seq} className="heart-name absolute left-1/2 bottom-[150px] -translate-x-1/2 max-w-[220px] truncate rounded-full px-3 py-1 text-[11px] font-bold text-white bg-linear-to-r from-pink-500/90 to-fuchsia-500/90 shadow-[0_0_14px_rgba(255,45,149,0.8)]">
          💗 {name.text} thả tim
        </div>
      )}
    </div>
  );
}
