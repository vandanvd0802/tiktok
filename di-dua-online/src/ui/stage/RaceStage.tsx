/** The 9:16 stage (laid out at 430 px wide): the 3D race with its overlays. */
import type { RaceSession, RaceState } from '../../application/RaceSession';
import { RaceCanvas } from './RaceCanvas';
import { Champions, CountdownSplash, GiftBanner, HeartTaps, HowToPlay, PhotoFinish, QueueBoard, RaceHeader, ResultsPodium, Standings, TopDonate } from './Overlays';

export function RaceStage({ state, session }: { state: RaceState; session: RaceSession }) {
  const { settings, race } = state;
  return (
    <div className="relative w-[430px] aspect-[9/16] overflow-hidden bg-[#8fd3ff] font-sans select-none">
      <RaceCanvas session={session} background={settings.background} />
      <PhotoFinish race={race} />
      <RaceHeader name={settings.channelName} race={race} viewers={state.status.viewerCount} />
      {settings.showTopBoard && <TopDonate title={settings.boardTitle} leaders={state.leaders} />}
      <Champions champions={state.champions} crown={state.crown} />
      <QueueBoard queue={state.queue} keyword={settings.keyword} />
      <HowToPlay keyword={settings.keyword} />
      <Standings race={race} />
      <CountdownSplash race={race} />
      <ResultsPodium race={race} />
      <GiftBanner toast={state.toasts[0]} />
      <HeartTaps pulse={state.heartPulse} />
    </div>
  );
}
