/**
 * An animal viewer. The glb animals move their parts with node animations (idle/walk/eat/dance/...): in the
 * crowd each one cycles through random clips, on the stage it dances, and walking is the walk clip while the
 * code moves the root.
 */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Actor, DanceStyle, PendingWalk } from './Actor';
import type { AnimalAsset } from './characterAssets';

const WALK_SPEED = 1.3; // m/s
const JUMP_TIME = 0.55;
const JUMP_HEIGHT = 0.3;
const CLIP_SECONDS = { min: 3, max: 7 };
const FADE = 0.25;
const HEAD_ROOM = 0.15;
const MAX_START_OFFSET = 3; // seconds: so the crowd is not all in step

export class AnimalActor implements Actor {
  readonly root = new THREE.Group();
  private readonly body: THREE.Group;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private path: THREE.Vector3[] = [];
  private onArrive?: () => void;
  private walking = false;
  private jumpT = -1;
  private clipLeft = 0;
  private readonly height: number;
  private readonly crowdClips: readonly string[];
  private readonly danceClip: string;
  style: DanceStyle = 'groove'; // human dance styles mean nothing here
  facing = 0;
  energy = 1;
  baseY = 0;
  onStage = false;

  constructor(asset: AnimalAsset) {
    this.body = cloneSkinned(asset.model) as THREE.Group;
    this.root.add(this.body);
    this.height = asset.height;
    this.crowdClips = asset.crowdClips;
    this.danceClip = asset.danceClip;
    this.mixer = new THREE.AnimationMixer(this.body);
    for (const [name, clip] of asset.clips) this.actions.set(name, this.mixer.clipAction(clip));
    this.play(this.pickCrowdClip());
    this.mixer.update(Math.random() * MAX_START_OFFSET);
    this.clipLeft = this.randomClipSeconds();
  }

  get isWalking() {
    return this.walking;
  }

  walkTo(points: THREE.Vector3[], onArrive?: () => void) {
    this.path = points.map((p) => p.clone());
    this.onArrive = onArrive;
    if (!this.walking) {
      this.walking = true;
      this.play('walk');
    }
  }

  pendingWalk(): PendingWalk | null {
    return this.walking ? { path: this.path, onArrive: this.onArrive } : null;
  }

  jump(delay = 0) {
    this.jumpT = -delay;
  }

  update(dt: number, _beat: number) {
    this.mixer.update(dt * (this.walking ? 1 : 0.85 + 0.3 * this.energy));
    if (this.walking) {
      this.stepAlongPath(dt);
      return;
    }
    this.root.rotation.y = this.facing;
    this.root.position.y = this.baseY + this.jumpLift(dt);
    if (this.onStage) {
      this.play(this.danceClip);
      return;
    }
    this.clipLeft -= dt;
    if (this.clipLeft <= 0) {
      this.play(this.pickCrowdClip());
      this.clipLeft = this.randomClipSeconds();
    }
  }

  private jumpLift(dt: number) {
    if (this.jumpT <= -1) return 0;
    this.jumpT += dt;
    if (this.jumpT >= JUMP_TIME) {
      this.jumpT = -1;
      return 0;
    }
    return this.jumpT > 0 ? Math.sin((Math.PI * this.jumpT) / JUMP_TIME) * JUMP_HEIGHT : 0;
  }

  private stepAlongPath(dt: number) {
    let step = WALK_SPEED * dt;
    while (step > 0 && this.path.length) {
      const to = this.path[0];
      const d = to.clone().sub(this.root.position);
      if (Math.hypot(d.x, d.z) > 0.001) this.root.rotation.y = Math.atan2(d.x, d.z);
      const len = d.length();
      if (len <= step) {
        this.root.position.copy(to);
        this.path.shift();
        step -= len;
      } else {
        this.root.position.addScaledVector(d, step / len);
        step = 0;
      }
    }
    if (this.path.length) return;
    this.walking = false;
    this.root.rotation.y = this.facing;
    this.play(this.onStage ? this.danceClip : this.pickCrowdClip());
    this.clipLeft = this.randomClipSeconds();
    const arrive = this.onArrive;
    this.onArrive = undefined;
    arrive?.();
  }

  private play(name: string) {
    const next = this.actions.get(name) ?? this.actions.get('idle');
    if (!next || next === this.current) return;
    next.reset().fadeIn(FADE).play();
    this.current?.fadeOut(FADE);
    this.current = next;
  }

  private pickCrowdClip() {
    return this.crowdClips[Math.floor(Math.random() * this.crowdClips.length)];
  }

  private randomClipSeconds() {
    return CLIP_SECONDS.min + Math.random() * (CLIP_SECONDS.max - CLIP_SECONDS.min);
  }

  headPosition(target: THREE.Vector3) {
    return target.set(this.root.position.x, this.root.position.y + this.height + HEAD_ROOM, this.root.position.z);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.body);
  }
}
