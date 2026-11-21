/** React wrapper around the three.js ClubScene: creates it once, then forwards prop changes to it. */
import { useEffect, useRef, useState } from 'react';
import type { StageCall } from '../../application/ClubSession';
import type { Clubber } from '../../domain/dancefloor';
import { loadCharacterAssets, type CharacterAssets } from '../../three/characterAssets';
import { ClubScene, type BeatSource } from '../../three/ClubScene';

let assetsPromise: Promise<CharacterAssets> | null = null;
const loadAssetsOnce = () => (assetsPromise ??= loadCharacterAssets());

type Props = {
  beats: BeatSource;
  crowd: Clubber[];
  stageCalls: StageCall[];
  drops: number;
  party: boolean;
  background: string;
};

export function ClubCanvas({ beats, crowd, stageCalls, drops, party, background }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tagsRef = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<ClubScene | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let created: ClubScene | null = null;
    let cancelled = false;
    loadAssetsOnce()
      .then((assets) => {
        if (cancelled || !canvasRef.current || !tagsRef.current) return;
        created = new ClubScene(canvasRef.current, tagsRef.current, assets, beats);
        if (new URLSearchParams(location.search).get('demo') === '1') (window as unknown as { __scene: ClubScene }).__scene = created;
        setScene(created);
      })
      .catch((err) => {
        console.error('[3D] could not load characters', err);
        setError('Không tải được nhân vật 3D');
      });
    return () => {
      cancelled = true;
      created?.dispose();
    };
  }, [beats]);

  useEffect(() => scene?.syncCrowd(crowd), [scene, crowd]);
  useEffect(() => scene?.stageCalls(stageCalls), [scene, stageCalls]);
  useEffect(() => scene?.setParty(party), [scene, party]);
  useEffect(() => scene?.setBackground(background), [scene, background]);
  const firstDrop = useRef(drops);
  useEffect(() => {
    if (drops !== firstDrop.current) scene?.drop();
  }, [scene, drops]);

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <div ref={tagsRef} className="absolute inset-0 pointer-events-none overflow-hidden" />
      {error && <div className="absolute inset-x-0 top-1/2 text-center text-xs text-red-300">{error}</div>}
    </>
  );
}
