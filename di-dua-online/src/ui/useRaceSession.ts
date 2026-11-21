/**
 * Client composition root: builds the race session with real audio on the stage page and silent stand-ins on
 * the dashboard (so the voice never doubles), feeds it the server's events, and exposes its state to React.
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { RaceSession } from '../application/RaceSession';
import { browserClock } from '../application/ports';
import { VoiceAnnouncer } from '../application/VoiceAnnouncer';
import { ClubAudioEngine, SilentEffects } from '../infrastructure/ClubAudioEngine';
import { BackgroundMusic } from '../infrastructure/BackgroundMusic';
import { subscribeToLiveEvents } from '../infrastructure/liveEvents';
import { SilentSpeech, TtsSpeechQueue } from '../infrastructure/TtsSpeechQueue';

type Deps = { session: RaceSession; music: BackgroundMusic | null; speech: TtsSpeechQueue | SilentSpeech; announcer: VoiceAnnouncer | null };

const SAMPLE_NAMES = [
  'Minh An', 'Thu Hà', 'Quốc Bảo', 'Lan Chi', 'Tuấn Kiệt', 'Ngọc Mai', 'Hoàng Nam', 'Bảo Ngọc', 'Gia Huy', 'Khánh Vy',
  'Kim Ngân', 'Đức Anh', 'Mỹ Linh', 'Văn Hùng', 'Hải Yến', 'Phương Thảo', 'Trọng Nghĩa', 'Diệu Linh', 'Minh Khôi', 'Anh Thư',
  'Thùy Dung', 'Quang Huy', 'Bích Ngọc', 'Tấn Phát', 'Hồng Nhung', 'Đăng Khoa', 'Ngọc Hân', 'Trung Kiên',
];

const WARM_DELAY_MS = 3000;

function buildDeps(isStage: boolean): Deps {
  if (!isStage) {
    return { session: new RaceSession(browserClock, new SilentEffects(), null), music: null, speech: new SilentSpeech(), announcer: null };
  }
  const audio = new ClubAudioEngine();
  const music = new BackgroundMusic(audio);
  const speech = new TtsSpeechQueue('/api/tts', (speaking) => music.duck(speaking));
  let session: RaceSession | null = null;
  const announcer = new VoiceAnnouncer(speech, () => session!.getState().settings, browserClock);
  session = new RaceSession(browserClock, audio, announcer);
  return { session, music, speech, announcer };
}

export function useRaceSession(isStage: boolean) {
  const deps = useMemo(() => buildDeps(isStage), [isStage]);
  const { session, music, speech, announcer } = deps;

  useEffect(() => {
    session.start();
    const unsubscribe = subscribeToLiveEvents({
      status: (s) => session.applyStatus(s),
      settings: (s) => session.applySettings(s),
      command: (c) => {
        if (isStage) session.command(c);
      },
      chat: (m) => session.chat(m),
      gift: (m) => session.gift(m),
      join: (v) => session.join(v),
      follow: (v) => session.follow(v),
      like: (m) => session.like(m),
      viewers: ({ viewerCount }) => session.applyViewerCount(viewerCount),
    });
    const params = new URLSearchParams(location.search);
    // ?demo=1: window.__dbo.command({ action: 'testGift', name, coins }) etc. for testing on any page
    if (params.get('demo') === '1') (window as unknown as { __dbo: RaceSession }).__dbo = session;
    // ?fill=1: a full queue of sample viewers for screenshots
    if (params.get('fill') === '1') {
      SAMPLE_NAMES.forEach((name) => session.chat({ id: name, name, avatar: '', text: session.getState().settings.keyword }, true));
    }
    return () => {
      unsubscribe();
      session.dispose();
    };
  }, [session, isStage]);

  const state = useSyncExternalStore(session.subscribe, session.getState);

  const { musicOn, musicVolume, musicTrack, voiceRate, voiceId } = state.settings;
  useEffect(() => {
    void music?.apply({ musicOn, musicVolume, musicTrack });
  }, [music, musicOn, musicVolume, musicTrack]);
  useEffect(() => speech.setRate(voiceRate), [speech, voiceRate]);
  useEffect(() => speech.setVoice(voiceId), [speech, voiceId]);
  // Fixed MC lines get synthesised once settings have settled (they arrive a moment after the page opens)
  const { channelName, keyword } = state.settings;
  useEffect(() => {
    if (!announcer) return;
    const t = setTimeout(() => announcer.warmUp(), WARM_DELAY_MS);
    return () => clearTimeout(t);
  }, [announcer, voiceId, channelName, keyword]);

  return { state, session };
}
