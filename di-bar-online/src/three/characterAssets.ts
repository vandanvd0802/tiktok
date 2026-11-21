/**
 * The clubber character: nguoi.fbx (own rig: Hips/Spine/Chest/...) with the Mixamo walk (di.fbx) retargeted
 * onto it. khan.fbx is only read for its Mixamo skeleton (the retarget source). Dance moves are procedural.
 */
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ALL_SKINS, isCharacterSkin, type SkinId } from '../domain/skins';
import { retargetClip, usesMixamoRig } from './retarget';

/** One glb skin (animal or human): its model (feet on the floor, scaled), its clips by name, and which clips it shows. */
export type AnimalAsset = {
  model: THREE.Group;
  clips: Map<string, THREE.AnimationClip>;
  height: number;
  crowdClips: readonly string[]; // played in turn while standing in the crowd
  danceClip: string; // played non-stop on the stage
};

export type CharacterAssets = { model: THREE.Group; walk: THREE.AnimationClip; skins: Map<SkinId, AnimalAsset> };

export const CHARACTER_HEIGHT = 1.7; // metres
export const ANIMAL_SCALE = 0.5; // the glb animals are ~1.8 units tall: this makes them under a metre, leaving room between neighbours
export const HUMAN_SKIN_HEIGHT = 0.9; // the glb characters are normalised to this height so they sit like the animals

// The glb animals have eat/dance/gesture clips; the glb characters have emotes instead and no dance clip.
const ANIMAL_CLIPS = { crowdClips: ['idle', 'eat', 'dance', 'gesture-positive', 'gesture-negative'], danceClip: 'dance' } as const;
const HUMAN_CLIPS = { crowdClips: ['idle', 'emote-yes', 'emote-no', 'interact-left', 'interact-right'], danceClip: 'emote-yes' } as const;

const BASE = '/assets/3d/';

export async function loadCharacterAssets(): Promise<CharacterAssets> {
  const loader = new FBXLoader();
  const skinsPromise = loadSkins();
  const [walkGroup, skeletonGroup, model] = await Promise.all([
    loader.loadAsync(BASE + 'di.fbx'),
    loader.loadAsync(BASE + 'khan.fbx'),
    loader.loadAsync(BASE + 'nguoi.fbx'),
  ]);
  const mixamoWalk = walkGroup.animations[0];
  if (!mixamoWalk) throw new Error('di.fbx has no animation');
  const walk = usesMixamoRig(model) ? mixamoWalk : retargetClip(model, skeletonGroup, mixamoWalk);
  pinHipsInPlace(walk);
  model.animations = [];

  const box = new THREE.Box3().setFromObject(model);
  model.scale.multiplyScalar(CHARACTER_HEIGHT / (box.max.y - box.min.y || 1));
  model.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.frustumCulled = false; // skinned bounds are stale once animated
  });
  return { model, walk, skins: await skinsPromise };
}

async function loadSkins(): Promise<Map<SkinId, AnimalAsset>> {
  const loader = new GLTFLoader();
  const entries = await Promise.all(
    ALL_SKINS.map(async (id) => {
      const human = isCharacterSkin(id);
      const gltf = await loader.loadAsync(`${BASE}${id}.glb`);
      const model = gltf.scene;
      model.scale.setScalar(ANIMAL_SCALE);
      model.updateMatrixWorld(true);
      if (human) {
        const raw = new THREE.Box3().setFromObject(model);
        model.scale.multiplyScalar(HUMAN_SKIN_HEIGHT / (raw.max.y - raw.min.y || 1));
        model.updateMatrixWorld(true);
      }
      const box = new THREE.Box3().setFromObject(model);
      model.position.y = -box.min.y; // stand on the floor
      model.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.frustumCulled = false;
      });
      const clips = new Map(gltf.animations.map((c) => [c.name, c] as const));
      const profile = human ? HUMAN_CLIPS : ANIMAL_CLIPS;
      return [id, { model, clips, height: box.max.y - box.min.y, ...profile } satisfies AnimalAsset] as const;
    })
  );
  return new Map(entries);
}

// Walking plays in place: the code moves the character, the clip keeps only the up-down bob of each step
function pinHipsInPlace(clip: THREE.AnimationClip) {
  for (const track of clip.tracks) {
    if (!/Hips\.position$/.test(track.name)) continue;
    const v = track.values;
    for (let i = 3; i < v.length; i += 3) {
      v[i] = v[0];
      v[i + 2] = v[2];
    }
  }
}

/** Club outfits: the robe becomes a coloured long jacket / dress, stitching an accent colour. */
export const OUTFITS: ReadonlyArray<{ main: number; accent: number; legs: number; hair: number }> = [
  { main: 0xff2d95, accent: 0xffffff, legs: 0x1b1b24, hair: 0x1a1412 },
  { main: 0x2d7dff, accent: 0x9be7ff, legs: 0x15151c, hair: 0x3b2416 },
  { main: 0x9dff3a, accent: 0x1b1b1b, legs: 0x23232b, hair: 0x1a1412 },
  { main: 0x9b4dff, accent: 0xffd34d, legs: 0x18181f, hair: 0xd9b26a },
  { main: 0xff8a1f, accent: 0x222222, legs: 0x1f1f26, hair: 0x1a1412 },
  { main: 0x10d0c0, accent: 0xffffff, legs: 0x16161d, hair: 0x5a3320 },
  { main: 0xe8243c, accent: 0x111111, legs: 0x1a1a21, hair: 0x1a1412 },
  { main: 0xf2f2f7, accent: 0xff2d95, legs: 0x22222a, hair: 0xff6fb5 },
  { main: 0x1c1c24, accent: 0xffc83d, legs: 0x101015, hair: 0x1a1412 },
  { main: 0xffe14d, accent: 0x2d2dff, legs: 0x1d1d24, hair: 0x3b2416 },
];

const materialCache = new Map<string, THREE.Material>();

/** Shared, recoloured copies of the character's materials for one outfit (built once per outfit). */
export function outfitMaterial(original: THREE.Material, outfit: number): THREE.Material {
  const key = `${outfit}:${original.name}`;
  let mat = materialCache.get(key);
  if (mat) return mat;
  const o = OUTFITS[outfit % OUTFITS.length];
  const copy = (original as THREE.MeshStandardMaterial).clone() as THREE.MeshStandardMaterial | THREE.MeshPhongMaterial;
  const name = original.name;
  if (/^Robe_LamGray/.test(name)) copy.color.setHex(o.main);
  else if (/Stitch/.test(name)) copy.color.setHex(o.accent);
  else if (/Trousers|Slippers/.test(name)) copy.color.setHex(o.legs);
  else if (/Hair/.test(name)) copy.color.setHex(o.hair);
  if ('shininess' in copy) copy.shininess = 40;
  mat = copy;
  materialCache.set(key, mat);
  return mat;
}
