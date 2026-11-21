/** The human runner models: public/assets/3d/character-*.glb (Kenney mini characters with sprint/idle/... clips). */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CHARACTER_SKINS, type SkinId } from '../domain/skins';

/** One runner model (feet on the ground, scaled) and its clips by name. */
export type RunnerAsset = { model: THREE.Group; clips: Map<string, THREE.AnimationClip>; height: number };

export type CharacterAssets = Map<SkinId, RunnerAsset>;

export const RUNNER_HEIGHT = 1.15; // metres

const BASE = '/assets/3d/';

export async function loadCharacterAssets(): Promise<CharacterAssets> {
  const loader = new GLTFLoader();
  const entries = await Promise.all(
    CHARACTER_SKINS.map(async (id) => {
      const gltf = await loader.loadAsync(`${BASE}${id}.glb`);
      const model = gltf.scene;
      model.updateMatrixWorld(true);
      const raw = new THREE.Box3().setFromObject(model);
      model.scale.multiplyScalar(RUNNER_HEIGHT / (raw.max.y - raw.min.y || 1));
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      model.position.y = -box.min.y; // stand on the ground
      model.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.frustumCulled = false; // skinned bounds are stale once animated
      });
      const clips = new Map(gltf.animations.map((c) => [c.name, c] as const));
      return [id, { model, clips, height: box.max.y - box.min.y }] as const;
    })
  );
  return new Map(entries);
}
