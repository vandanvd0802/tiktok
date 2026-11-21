/** The 9:16 stage (laid out at 430 px wide): the 3D bar with its overlays. */
import { useEffect, useState } from 'react';
import type { ClubState } from '../../application/ClubSession';
import type { BeatSource } from '../../three/ClubScene';
import { ClubCanvas } from './ClubCanvas';
import { DropFlash, GiftBanner, GiftToasts, HeartMeters, HeartTaps, KeywordHint, NeonTitle, SkinHint, TopBoard } from './Overlays';

function useNow(everyMs: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

export function ClubStage({ state, beats }: { state: ClubState; beats: BeatSource }) {
  const now = useNow(500);
  const { settings, likes } = state;
  const partyLeftMs = Math.max(0, likes.partyUntil - now);
  return (
    <div className="relative w-[430px] aspect-[9/16] overflow-hidden bg-[#05030a] font-sans select-none">
      <ClubCanvas
        beats={beats}
        crowd={state.crowd}
        stageCalls={state.stageCalls}
        drops={state.drops}
        party={partyLeftMs > 0}
        background={settings.background}
      />
      <NeonTitle name={settings.channelName} viewers={state.status.viewerCount} />
      {settings.showTopBoard && <TopBoard title={settings.boardTitle} leaders={state.leaders} />}
      <GiftToasts toasts={state.toasts} />
      <KeywordHint keyword={settings.keyword} />
      <SkinHint />
      <HeartMeters party={likes.partyProgress} drop={likes.dropProgress} partyLeftMs={partyLeftMs} />
      <GiftBanner toast={state.toasts[0]} />
      <HeartTaps pulse={state.heartPulse} />
      <DropFlash drops={state.drops} />
    </div>
  );
}
