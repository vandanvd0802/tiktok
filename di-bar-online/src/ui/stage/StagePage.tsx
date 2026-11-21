/** ?view=stage: the page TikTok LIVE Studio captures. The 430 px stage is zoomed to fill the window. */
import { useEffect, useState } from 'react';
import { useClubSession } from '../useClubSession';
import { ClubStage } from './ClubStage';

const STAGE_WIDTH = 430;
const STAGE_HEIGHT = (STAGE_WIDTH * 16) / 9;

export function StagePage({ withSound }: { withSound: boolean }) {
  const { state, beats } = useClubSession(withSound);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const fit = () => setZoom(Math.min(window.innerWidth / STAGE_WIDTH, window.innerHeight / STAGE_HEIGHT));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return (
    <div className="w-screen h-screen bg-black flex items-center justify-center overflow-hidden">
      <div style={{ zoom }}>
        <ClubStage state={state} beats={beats} />
      </div>
    </div>
  );
}
