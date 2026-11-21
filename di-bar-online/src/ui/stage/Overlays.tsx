/** The 2D layers drawn over the 3D bar: neon title, TOP board, gift toasts, heart meters, keyword hint, skin hint. */
import { useEffect, useRef, useState } from 'react';
import type { GiftToast, HeartPulse } from '../../application/ClubSession';
import type { LeaderEntry } from '../../domain/leaderboard';
import { DROP_LIKES, PARTY_LIKES } from '../../domain/likeMeter';

export function NeonTitle({ name, viewers }: { name: string; viewers: number }) {
  return (
    <div className="absolute top-3 inset-x-0 flex flex-col items-center pointer-events-none">
      <div className="neon-title text-[26px] leading-none font-black tracking-wide uppercase px-4 text-center">{name}</div>
      {viewers > 0 && <div className="mt-1 text-[10px] font-semibold text-pink-100/80">👀 {viewers} người đang quẩy</div>}
    </div>
  );
}

function Avatar({ src, name, size }: { src: string; name: string; size: number }) {
  const style = { width: size, height: size };
  if (src) return <img src={src} referrerPolicy="no-referrer" className="rounded-full object-cover shrink-0 ring-1 ring-white/40" style={style} alt="" />;
  return (
    <span className="rounded-full shrink-0 bg-fuchsia-600 text-white font-bold flex items-center justify-center text-[9px]" style={style}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

const MEDALS = ['🥇', '🥈', '🥉'];

export function TopBoard({ title, leaders }: { title: string; leaders: LeaderEntry[] }) {
  return (
    <div className="absolute left-2 top-[62px] w-[132px] rounded-xl bg-black/45 backdrop-blur-sm border border-fuchsia-400/40 shadow-[0_0_14px_rgba(255,45,149,0.35)] p-1.5 pointer-events-none">
      <div className="text-center text-[10px] font-black tracking-widest text-fuchsia-200 mb-1">{title}</div>
      {!leaders.length && <div className="py-1 text-center text-[9.5px] font-semibold text-white/70">Bình luận hoặc tặng quà để lên bảng</div>}
      {leaders.slice(0, 6).map((l, i) => (
        <div key={l.key} className="flex items-center gap-1 h-[19px] text-[9.5px]">
          <span className="w-3.5 text-center shrink-0">{MEDALS[i] ?? <span className="text-white/60">{i + 1}</span>}</span>
          <Avatar src={l.avatar} name={l.name} size={14} />
          <span className="truncate flex-1 text-white font-semibold">{l.name}</span>
          <span className="text-cyan-200 font-bold tabular-nums">{l.points}</span>
        </div>
      ))}
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

/** Big blinking "NAME GIFT x N" across the stage for the newest gift; fades out by itself. */
export function GiftBanner({ toast }: { toast: GiftToast | undefined }) {
  if (!toast) return null;
  const style = BANNER_STYLE[toast.tier];
  return (
    <div key={toast.id} className="absolute inset-0 pointer-events-none overflow-hidden">
      <div className="gift-edge-flash" style={{ ['--flash' as string]: style.flash }} />
      <div className="gift-banner absolute inset-x-3 top-[22%] flex flex-col items-center">
        <div className={`gift-banner-box flex items-center gap-2.5 rounded-3xl px-4 py-2.5 bg-linear-to-r ${style.box} border-2 border-white/80`}>
          <Avatar src={toast.avatar} name={toast.name} size={toast.tier === 'small' ? 40 : 52} />
          <div className="min-w-0 text-center leading-tight">
            <div className="text-[15px] font-bold text-white truncate max-w-[250px]">{toast.name}</div>
            <div className="text-[13px] font-semibold text-white/90 tracking-widest">TẶNG</div>
          </div>
        </div>
        <div className={`gift-banner-text mt-1.5 font-black uppercase text-center leading-none ${style.text}`}>
          {toast.giftName}
          {toast.count > 1 && <span className="ml-2 text-[0.8em]">x{toast.count}</span>}
        </div>
      </div>
    </div>
  );
}

export function GiftToasts({ toasts }: { toasts: GiftToast[] }) {
  return (
    <div className="absolute right-2 top-[62px] flex flex-col items-end gap-1.5 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className={`gift-toast flex items-center gap-1.5 max-w-[190px] rounded-full pl-1 pr-2.5 py-1 bg-linear-to-r ${TOAST_STYLE[t.tier]} shadow-lg`}>
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

function Meter({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] font-bold text-white/90 w-[104px] shrink-0 whitespace-nowrap">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-white/15 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-[width] duration-300`} style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="text-[9px] tabular-nums text-white/80 w-[46px] text-right">
        {value}/{max}
      </span>
    </div>
  );
}

export function HeartMeters({ party, drop, partyLeftMs }: { party: number; drop: number; partyLeftMs: number }) {
  return (
    <div className="absolute inset-x-3 bottom-3 rounded-xl bg-black/50 backdrop-blur-sm border border-white/10 px-2.5 py-1.5 flex flex-col gap-1 pointer-events-none">
      {partyLeftMs > 0 ? (
        <div className="text-center text-[12px] font-black tracking-wider">🔥 <span className="party-banner">BÙNG NỔ · còn {Math.ceil(partyLeftMs / 1000)}s</span> 🔥</div>
      ) : (
        <Meter label={`❤️ ${PARTY_LIKES} tim: bùng nổ`} value={party} max={PARTY_LIKES} color="bg-linear-to-r from-pink-500 to-fuchsia-400" />
      )}
      <Meter label={`⚡ ${DROP_LIKES} tim: drop nhạc`} value={drop} max={DROP_LIKES} color="bg-linear-to-r from-cyan-400 to-blue-500" />
    </div>
  );
}

export function KeywordHint({ keyword }: { keyword: string }) {
  return (
    <div className="absolute inset-x-0 bottom-[66px] flex justify-center pointer-events-none">
      <div className="keyword-hint rounded-full px-3 py-1 text-[10.5px] font-bold text-white bg-black/40 border border-cyan-300/50">
        Gõ <span className="text-cyan-200">“{keyword}”</span> để lên sân khấu 💃
      </div>
    </div>
  );
}

const SKIN_EXAMPLES = ['heo', 'sư tử', 'mèo', 'panda'];

/** Right-hand hint: how to change your skin (big on purpose, it has to read on a phone). */
export function SkinHint() {
  return (
    <div className="absolute right-2 top-[26%] w-[150px] rounded-2xl bg-black/55 backdrop-blur-sm border-2 border-cyan-300/60 px-2.5 py-2 text-center pointer-events-none shadow-[0_0_16px_rgba(103,232,249,0.45)]">
      <div className="text-[15px] font-black tracking-wide text-cyan-200">ĐỔI SKIN</div>
      <div className="mt-1 text-[14px] font-bold leading-snug text-white">
        Gõ <span className="text-yellow-300">“người”</span> hoặc <span className="text-yellow-300">“thú vật”</span>
      </div>
      <div className="mt-1 text-[13px] font-semibold leading-snug text-white/90">hoặc tên con vật bạn thích:</div>
      <div className="mt-1 flex flex-wrap justify-center gap-1">
        {SKIN_EXAMPLES.map((name) => (
          <span key={name} className="rounded-full bg-fuchsia-600/80 px-2 py-0.5 text-[13px] font-bold text-white">
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

/** White flash on a beat drop. */
export function DropFlash({ drops }: { drops: number }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!drops) return;
    setOn(true);
    const t = setTimeout(() => setOn(false), 1300);
    return () => clearTimeout(t);
  }, [drops]);
  if (!on) return null;
  return (
    <div className="absolute inset-0 pointer-events-none drop-flash flex items-center justify-center">
      <div className="drop-text text-[44px] font-black text-white">DROP!</div>
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
      left: 8 + Math.random() * 84,
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
        <div key={name.seq} className="heart-name absolute left-1/2 bottom-[112px] -translate-x-1/2 max-w-[260px] truncate rounded-full px-3 py-1 text-[11px] font-bold text-white bg-linear-to-r from-pink-500/90 to-fuchsia-500/90 shadow-[0_0_14px_rgba(255,45,149,0.8)]">
          💗 {name.text} thả tim
        </div>
      )}
    </div>
  );
}
