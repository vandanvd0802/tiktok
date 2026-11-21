/** React wrapper around the three.js RaceScene: creates it once, then forwards prop changes to it. */
import { useEffect, useRef, useState } from 'react';
import type { RaceSession } from '../../application/RaceSession';
import { loadCharacterAssets, type CharacterAssets } from '../../three/characterAssets';
import { RaceScene } from '../../three/RaceScene';

let assetsPromise: Promise<CharacterAssets> | null = null;
const loadAssetsOnce = () => (assetsPromise ??= loadCharacterAssets());

export function RaceCanvas({ session, background }: { session: RaceSession; background: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tagsRef = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<RaceScene | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let created: RaceScene | null = null;
    let cancelled = false;
    loadAssetsOnce()
      .then((assets) => {
        if (cancelled || !canvasRef.current || !tagsRef.current) return;
        created = new RaceScene(canvasRef.current, tagsRef.current, assets, session);
        if (new URLSearchParams(location.search).get('demo') === '1') (window as unknown as { __scene: RaceScene }).__scene = created;
        setScene(created);
      })
      .catch((err) => {
        console.error('[3D] could not load runners', err);
        setError('Không tải được nhân vật 3D');
      });
    return () => {
      cancelled = true;
      created?.dispose();
    };
  }, [session]);

  useEffect(() => scene?.setBackground(background), [scene, background]);

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <div ref={tagsRef} className="absolute inset-0 pointer-events-none overflow-hidden" />
      {error && <div className="absolute inset-x-0 top-1/2 text-center text-xs text-red-300">{error}</div>}
    </>
  );
}
