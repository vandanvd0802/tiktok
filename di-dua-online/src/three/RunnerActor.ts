/**
 * One runner on the track. The scene tells it each frame where it is and what it is doing (`pose`); it picks
 * the clip (idle / sprint / fall / cheer) and draws the extras: hop arc, flying height with wings and a glow.
 */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { BuffEffects } from './BuffEffects';
import type { RunnerAsset } from './characterAssets';

export type RunnerMotion = 'ready' | 'run' | 'trip' | 'cheer';

export type RunnerPose = {
  x: number;
  z: number;
  motion: RunnerMotion;
  hop: number | null; // 0..1 through a hurdle hop
  flying: boolean;
  turbo: boolean;
  duel?: boolean; // one of the two leaders in a photo finish
  speedFactor: number; // how fast the legs move
};

const CLIP: Record<RunnerMotion, string> = { ready: 'idle', run: 'sprint', trip: 'die', cheer: 'emote-yes' };
const FADE = 0.15;
const HOP_HEIGHT = 0.75;
const FLY_HEIGHT = 2.1;
const FLY_EASE = 4; // per second
const HEAD_ROOM = 0.2;

function makeWing(side: 1 | -1): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(side * 0.35, 0.45, side * 0.95, 0.42);
  shape.quadraticCurveTo(side * 0.7, 0.2, side * 0.8, 0.05);
  shape.quadraticCurveTo(side * 0.5, 0.0, side * 0.6, -0.15);
  shape.quadraticCurveTo(side * 0.3, -0.1, 0, 0);
  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false })
  );
  return mesh;
}

export class RunnerActor {
  readonly root = new THREE.Group();
  private readonly body: THREE.Group;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private readonly wings = new THREE.Group();
  private readonly glow: THREE.Mesh;
  private readonly shadow: THREE.Mesh;
  private readonly height: number;
  private readonly effects: BuffEffects;
  private lift = 0; // current flying height
  private t = Math.random() * 10;

  constructor(asset: RunnerAsset) {
    this.body = cloneSkinned(asset.model) as THREE.Group;
    this.root.add(this.body);
    this.height = asset.height;
    this.mixer = new THREE.AnimationMixer(this.body);
    for (const [name, clip] of asset.clips) {
      const action = this.mixer.clipAction(clip);
      if (name === 'die') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions.set(name, action);
    }

    const left = makeWing(1);
    const right = makeWing(-1);
    left.position.set(0.08, 0, 0);
    right.position.set(-0.08, 0, 0);
    this.wings.add(left, right);
    this.wings.position.set(0, asset.height * 0.62, -0.18);
    this.wings.visible = false;
    this.root.add(this.wings);

    this.glow = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.7, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.visible = false;
    this.root.add(this.glow);

    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.32, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.015;
    this.root.add(this.shadow);
    this.effects = new BuffEffects(this.root, asset.height);
    this.play('idle');
    this.mixer.update(Math.random());
  }

  update(dt: number, pose: RunnerPose) {
    this.t += dt;
    this.play(CLIP[pose.motion]);
    const clipSpeed = pose.motion === 'run' ? pose.speedFactor * (pose.turbo ? 1.35 : 1) : 1;
    this.mixer.update(dt * clipSpeed);

    const targetLift = pose.flying ? FLY_HEIGHT + Math.sin(this.t * 3) * 0.15 : 0;
    this.lift += (targetLift - this.lift) * Math.min(1, dt * FLY_EASE);
    const hopLift = pose.hop === null ? 0 : Math.sin(Math.PI * pose.hop) * HOP_HEIGHT;
    const y = Math.max(this.lift, hopLift);
    this.body.position.y = y;
    this.root.position.set(pose.x, 0, pose.z);
    this.root.rotation.y = 0; // facing +z, down the track toward the camera

    // the shadow stays on the ground and shrinks the higher they go
    const s = 1 / (1 + y * 0.5);
    this.shadow.scale.setScalar(s);
    this.wings.visible = pose.flying || this.lift > 0.3;
    this.glow.visible = this.wings.visible;
    if (this.wings.visible) {
      const flap = 0.35 + 0.45 * Math.sin(this.t * 14);
      this.wings.children[0].rotation.y = -flap;
      this.wings.children[1].rotation.y = flap;
      this.wings.position.y = this.height * 0.62 + y;
      this.glow.position.y = y + 0.05;
      this.glow.rotation.z = this.t * 2;
      this.glow.scale.setScalar(1 + 0.12 * Math.sin(this.t * 8));
    }
    this.effects.update(dt, pose.flying, pose.turbo, y, pose.duel);
  }

  /** A gift lifted them: lightning strikes. */
  strike() {
    this.effects.strike();
  }

  /** Cheers or hearts sped them up: nitro blast. */
  burst() {
    this.effects.burst();
  }

  headPosition(target: THREE.Vector3) {
    return target.set(this.root.position.x, this.body.position.y + this.height + HEAD_ROOM, this.root.position.z);
  }

  private play(name: string) {
    const next = this.actions.get(name) ?? this.actions.get('idle');
    if (!next || next === this.current) return;
    next.reset().fadeIn(FADE).play();
    this.current?.fadeOut(FADE);
    this.current = next;
  }

  dispose() {
    this.effects.dispose();
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.body);
  }
}
