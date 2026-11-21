/**
 * Control page at http://localhost:3000/ (silent). Connects the TikTok room, changes the saved settings and
 * sends commands to the stage page, which is the only page that makes sound.
 */
import { useEffect, useState } from 'react';
import type { StageCommand, StageSettings } from '../../../shared/contracts';
import { dashboardApi } from '../../infrastructure/dashboardApi';
import { RaceStage } from '../stage/RaceStage';
import { useRaceSession } from '../useRaceSession';
import { inputCls, Panel, primary, secondary, TextSetting, Toggle } from './controls';
import { McPanel } from './McPanel';
import { MusicPanel } from './MusicPanel';

function useAction() {
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  // Shows the outcome as a toast; resolves true when the call worked
  const run = async (work: () => Promise<unknown>, done?: string): Promise<boolean> => {
    try {
      await work();
      if (done) setMessage({ text: done, error: false });
      return true;
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : String(err), error: true });
      return false;
    }
  };
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(t);
  }, [message]);
  return { run, message };
}

export function DashboardPage() {
  const { state, session } = useRaceSession(false);
  const { settings, status } = state;
  const { run, message } = useAction();
  const [username, setUsername] = useState('');
  useEffect(() => {
    if (status.username) setUsername((u) => u || status.username);
  }, [status.username]);

  const save = (patch: Partial<StageSettings>) => run(() => dashboardApi.updateSettings(patch), 'Đã lưu');
  const send = (cmd: StageCommand, done = 'Đã gửi tới trang live') => run(() => dashboardApi.command(cmd), done);
  const stageUrl = `http://lvh.me:${location.port || 3000}/?view=stage`;

  return (
    <div className="min-h-screen bg-[#07040d] text-white">
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="text-xl font-black tracking-wide neon-title">ĐUA ONLINE</div>
        <div className="text-xs text-white/50">
          Link cho TikTok LIVE Studio (1080×1920): <code className="text-cyan-300 select-all">{stageUrl}</code>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-[430px_1fr] gap-6 items-start">
        <div className="lg:sticky lg:top-6 rounded-2xl overflow-hidden border border-white/10">
          <RaceStage state={state} session={session} />
          <div className="text-center text-[11px] text-white/40 py-2 bg-black/50">Xem trước (không có tiếng)</div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Panel title="Kết nối TikTok LIVE">
            <div className="flex gap-2">
              <input className={inputCls} placeholder="username TikTok (không cần @)" value={username} onChange={(e) => setUsername(e.target.value)} />
              {status.isConnected || status.isConnecting ? (
                <button className={secondary} onClick={() => run(() => dashboardApi.disconnect())}>
                  Ngắt
                </button>
              ) : (
                <button className={primary} disabled={!username.trim()} onClick={() => run(() => dashboardApi.connect(username), 'Đã kết nối')}>
                  Kết nối
                </button>
              )}
            </div>
            <div className="text-sm">
              {status.isConnected ? (
                <span className="text-emerald-400">● Đang nhận sự kiện từ @{status.username}</span>
              ) : status.isConnecting ? (
                <span className="text-amber-300">● Đang kết nối…</span>
              ) : (
                <span className="text-white/50">● Chưa kết nối</span>
              )}
              {status.error && <div className="text-red-300 text-xs mt-1">{status.error}</div>}
            </div>
            <div className="flex gap-4 text-xs text-white/60">
              <span>👀 {status.viewerCount} người xem</span>
              <span>❤️ {status.totalLikes} tim</span>
              <span>🏃 {state.queue.length} người đang chờ đua</span>
            </div>
          </Panel>

          <McPanel settings={settings} onSave={save} onSend={send} />

          <MusicPanel settings={settings} onSave={save} />

          <Panel title="Tùy chỉnh sân khấu">
            <TextSetting label="Tên kênh (tiêu đề + giọng đọc xưng tên này)" value={settings.channelName} max={40} onSave={(v) => save({ channelName: v })} />
            <TextSetting label="Từ khóa để vào hàng chờ đua" value={settings.keyword} max={30} onSave={(v) => save({ keyword: v })} />
            <TextSetting label="Tên bảng top donate" value={settings.boardTitle} max={24} onSave={(v) => save({ boardTitle: v })} />
            <Toggle label="Hiện bảng top donate" on={settings.showTopBoard} onChange={(v) => save({ showTopBoard: v })} />
            <div className="flex gap-2 items-center flex-wrap">
              <label className={`${secondary} cursor-pointer`}>
                Ảnh khán đài riêng…
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void run(() => dashboardApi.uploadBackground(file), 'Đã đổi ảnh nền');
                    e.target.value = '';
                  }}
                />
              </label>
              {settings.background && (
                <button className={secondary} onClick={() => run(() => dashboardApi.resetBackground(), 'Đã về nền mặc định')}>
                  Về nền mặc định
                </button>
              )}
            </div>
          </Panel>

          <Panel title="Thử (không cần live)">
            <div className="flex gap-2 flex-wrap">
              <button className={secondary} onClick={() => send({ action: 'testGift', name: 'Khách Test', coins: 1 })}>
                🌹 Quà 1 xu
              </button>
              <button className={secondary} onClick={() => send({ action: 'testGift', name: 'Đại Gia Test', coins: 199 })}>
                💎 Quà 199 xu
              </button>
              <button className={secondary} onClick={() => send({ action: 'testGift', name: 'Siêu Đại Gia', coins: 5000 })}>
                🚀 Quà 5000 xu
              </button>
              <button className={secondary} onClick={() => send({ action: 'testLike', name: 'Khách Tim', count: 5 })}>
                ❤️ Thả tim
              </button>
              <button className={secondary} onClick={() => send({ action: 'startRace' })}>
                🏁 Bắt đầu đua ngay
              </button>
              <button
                className={secondary}
                onClick={() => {
                  // five different fans: enough for one boost
                  for (let i = 0; i < 5; i++) void dashboardApi.command({ action: 'testComment', name: `Fan Test ${i + 1}`, text: '3' });
                }}
              >
                📣 5 người cổ vũ làn 3
              </button>
              <button
                className={secondary}
                onClick={() => {
                  // the first real runner in the race changes character
                  const runner = state.race.standings.find((s) => !s.bot);
                  if (runner) void send({ action: 'testComment', name: runner.name, text: 'người' });
                }}
              >
                🔄 Người chạy gõ “người”
              </button>
              <button className={secondary} onClick={() => send({ action: 'testComment', name: `Khách ${Math.floor(Math.random() * 90 + 10)}`, text: settings.keyword })}>
                💬 Comment “{settings.keyword}”
              </button>
            </div>
            <p className="text-xs text-white/40">Lệnh thử chỉ chạy trên trang live (?view=stage) đang mở.</p>
          </Panel>
        </div>
      </main>

      {message && (
        <div className={`fixed bottom-5 right-5 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-xl ${message.error ? 'bg-red-600' : 'bg-emerald-600'}`}>{message.text}</div>
      )}
    </div>
  );
}
