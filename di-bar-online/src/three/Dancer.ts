/**
 * One clubber. Walking uses the retargeted Mixamo clip; dancing is posed in code every frame on the beat,
 * as rotations about the body's own axes (x = their left, y = up, z = facing) applied on top of the rest pose.
 */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CHARACTER_HEIGHT, outfitMaterial, type CharacterAssets } from './characterAssets';

import type { Actor, DanceStyle, PendingWalk } from './Actor';

export type { DanceStyle };
const CROWD_STYLES: DanceStyle[] = ['pump', 'handsUp', 'groove', 'clap', 'shuffle', 'groove'];

const WALK_SPEED = 1.6; // m/s
const JUMP_TIME = 0.55;
const JUMP_HEIGHT = 0.35;
const POSED = [
  'Hips', 'Spine', 'Chest', 'Neck', 'Head',
  'ClavicleL', 'UpperArmL', 'ForearmL', 'HandL', 'ClavicleR', 'UpperArmR', 'ForearmR', 'HandR',
  'ThighL', 'ShinL', 'FootL', 'ThighR', 'ShinR', 'FootR',
] as const;
type BoneName = (typeof POSED)[number];
type Axis = 'x' | 'y' | 'z';
type Turn = [Axis, number];

type PosedBone = { bone: THREE.Object3D; rest: THREE.Quaternion; axes: Record<Axis, THREE.Vector3> };

const TAU = Math.PI * 2;
const REST_RAISE = 1.45; // the rig rests in a T-pose: arms straight out sideways
const TMP = new THREE.Quaternion();
const IDENTITY = new THREE.Quaternion();

export class Dancer implements Actor {
  readonly root = new THREE.Group();
  readonly head?: THREE.Object3D;
  private readonly bones = new Map<BoneName, PosedBone>();
  private readonly hipsRest = new THREE.Vector3();
  private readonly unit: number; // model units per metre (bones live in the unscaled model space)
  private readonly mixer: THREE.AnimationMixer;
  private readonly walkAction: THREE.AnimationAction;
  private readonly robe: Array<[THREE.Object3D, THREE.Object3D, number]> = [];
  private path: THREE.Vector3[] = [];
  private onArrive?: () => void;
  private walking = false;
  private jumpT = -1;
  private readonly phase = Math.random() * 0.25; // not everyone exactly on the beat
  private readonly sway = 0.6 + Math.random() * 0.6;
  style: DanceStyle;
  facing = 0; // yaw while dancing (0 = toward the camera)
  energy = 1;
  onStage = false;

  constructor(assets: CharacterAssets, outfit: number, style?: DanceStyle) {
    const body = cloneSkinned(assets.model) as THREE.Group;
    this.root.add(body);
    this.unit = 1 / body.scale.x;
    this.style = style ?? CROWD_STYLES[Math.floor(Math.random() * CROWD_STYLES.length)];

    const byName = new Map<string, THREE.Object3D>();
    body.traverse((o) => {
      byName.set(o.name, o);
      const mesh = o as THREE.SkinnedMesh;
      if (mesh.isMesh) mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => outfitMaterial(m, outfit)) : outfitMaterial(mesh.material, outfit);
    });
    this.head = byName.get('Head');
    body.updateMatrixWorld(true);
    const bodyQ = body.getWorldQuaternion(new THREE.Quaternion());
    for (const name of POSED) {
      const bone = byName.get(name);
      if (!bone) continue;
      // The body's x/y/z axes as seen from this bone's parent at rest, so a turn reads "raise arm sideways"
      const parentQ = bone.parent ? bone.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
      const toParent = parentQ.invert().multiply(bodyQ);
      const axis = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyQuaternion(toParent).normalize();
      this.bones.set(name, { bone, rest: bone.quaternion.clone(), axes: { x: axis(1, 0, 0), y: axis(0, 1, 0), z: axis(0, 0, 1) } });
    }
    const hips = byName.get('Hips');
    if (hips) this.hipsRest.copy(hips.position);
    for (const side of ['L', 'R']) {
      const thigh = byName.get('Thigh' + side);
      const shin = byName.get('Shin' + side);
      const follow: Array<[string, THREE.Object3D | undefined, number]> = [
        ['RobeUpperFront' + side, thigh, 0.85],
        ['RobeUpperBack' + side, thigh, 0.4],
        ['RobeLowerFront' + side, shin, 0.55],
        ['RobeLowerBack' + side, shin, 0.3],
      ];
      for (const [panel, leg, amount] of follow) {
        const p = byName.get(panel);
        if (p && leg) this.robe.push([p, leg, amount]);
      }
    }

    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.32, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012;
    this.root.add(shadow);

    this.mixer = new THREE.AnimationMixer(body);
    this.walkAction = this.mixer.clipAction(assets.walk);
  }

  get isWalking() {
    return this.walking;
  }

  walkTo(points: THREE.Vector3[], onArrive?: () => void) {
    this.path = points.map((p) => p.clone());
    this.onArrive = onArrive;
    if (!this.walking) {
      this.walking = true;
      this.walkAction.reset().play();
    }
  }

  pendingWalk(): PendingWalk | null {
    return this.walking ? { path: this.path, onArrive: this.onArrive } : null;
  }

  jump(delay = 0) {
    this.jumpT = -delay;
  }

  update(dt: number, beat: number) {
    if (this.walking) this.stepAlongPath(dt);
    else this.dance(beat + this.phase, dt);
    this.followRobe();
  }

  private stepAlongPath(dt: number) {
    this.mixer.update(dt);
    let step = WALK_SPEED * dt;
    while (step > 0 && this.path.length) {
      const to = this.path[0];
      const d = to.clone().sub(this.root.position);
      const flat = Math.hypot(d.x, d.z);
      if (flat > 0.001) this.root.rotation.y = Math.atan2(d.x, d.z);
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
    this.walkAction.stop();
    this.root.rotation.y = this.facing;
    const arrive = this.onArrive;
    this.onArrive = undefined;
    arrive?.();
  }

  private pose(name: BoneName, turns: Turn[]) {
    const b = this.bones.get(name);
    if (!b) return;
    b.bone.quaternion.copy(IDENTITY);
    for (const [axis, angle] of turns) if (angle) b.bone.quaternion.multiply(TMP.setFromAxisAngle(b.axes[axis], angle));
    b.bone.quaternion.multiply(b.rest);
  }

  private dance(beat: number, dt: number) {
    const e = this.energy;
    const onBeat = 0.5 + 0.5 * Math.cos(TAU * beat); // 1 on the beat, 0 between
    const half = Math.sin(Math.PI * beat); // one side per beat
    let jumpLift = 0;
    let armsUp = false;
    if (this.jumpT > -1) {
      this.jumpT += dt;
      if (this.jumpT >= JUMP_TIME) this.jumpT = -1;
      else if (this.jumpT > 0) {
        jumpLift = Math.sin((Math.PI * this.jumpT) / JUMP_TIME) * JUMP_HEIGHT;
        armsUp = true;
      }
    }
    this.root.rotation.y = this.facing + (this.style === 'shuffle' ? 0.25 * half : 0.08 * half * this.sway);

    // legs: knees bend on the beat, hips dip with them
    const knee = (0.18 + 0.12 * e) * onBeat;
    const shuffleKick = this.style === 'shuffle' ? 0.35 * Math.max(0, Math.sin(TAU * beat * 0.5)) : 0;
    this.pose('ThighL', [['x', -knee - shuffleKick]]);
    this.pose('ShinL', [['x', knee * 2 + shuffleKick]]);
    this.pose('FootL', [['x', -knee]]);
    this.pose('ThighR', [['x', -knee]]);
    this.pose('ShinR', [['x', knee * 2]]);
    this.pose('FootR', [['x', -knee]]);
    const hips = this.bones.get('Hips');
    if (hips) {
      hips.bone.position.copy(this.hipsRest);
      hips.bone.position.y -= (0.05 + 0.03 * e) * onBeat * this.unit;
      hips.bone.position.x += 0.03 * half * this.sway * this.unit;
    }
    this.root.position.y = this.baseY + jumpLift;
    this.pose('Hips', [['z', -0.06 * half * this.sway]]);
    this.pose('Spine', [['z', 0.08 * half * this.sway], ['x', 0.06 * onBeat]]);
    this.pose('Chest', [['y', 0.12 * half * this.sway]]);
    this.pose('Neck', [['x', 0.2 * onBeat * e]]);
    this.pose('Head', [['x', 0.1 * onBeat], ['z', 0.05 * half]]);
    this.pose('ClavicleL', []);
    this.pose('ClavicleR', []);
    this.poseArms(armsUp ? 'handsUp' : this.style, beat, onBeat, half, e);
  }

  baseY = 0; // floor height under them (the stage is raised)

  /**
   * One arm, measured from hanging at the side (the rig's rest is a T-pose): `raise` lifts it sideways
   * (0 = down, ~1.45 = straight out, ~2.8 = overhead), `forward` swings it to the front, `elbow` bends the
   * forearm forward, `elbowUp` bends it upward (goalpost).
   */
  private arm(side: 'L' | 'R', raise: number, forward = 0, elbow = 0, elbowUp = 0) {
    const s = side === 'L' ? 1 : -1;
    const up = raise < 1.45 ? -1 : 1; // which way "forward" turns depends on whether the arm points down or up
    this.pose(`UpperArm${side}`, [['x', up * forward], ['z', s * (raise - REST_RAISE)]]);
    this.pose(`Forearm${side}`, [['y', -s * elbow], ['z', s * elbowUp]]);
  }

  private poseArms(style: DanceStyle, beat: number, onBeat: number, half: number, e: number) {
    switch (style) {
      case 'pump': {
        const pump = 0.35 * onBeat * e;
        this.arm('R', 2.55 + pump * 0.4, 0.2, 0.25 + pump);
        this.arm('L', 0.35, 0.5 + 0.2 * half, 1.6);
        break;
      }
      case 'handsUp': {
        const wave = 0.22 * half * e;
        this.arm('L', 2.6 - 0.15 * onBeat + wave, 0.1, 0.15);
        this.arm('R', 2.6 - 0.15 * onBeat - wave, 0.1, 0.15);
        break;
      }
      case 'clap': {
        const close = 0.3 * onBeat;
        this.arm('L', 2.75 + close * 0.3, 0.35, 0.5 + close);
        this.arm('R', 2.75 + close * 0.3, 0.35, 0.5 + close);
        break;
      }
      case 'shuffle': {
        const swing = 0.55 * Math.sin(Math.PI * beat) * e;
        this.arm('L', 0.25, 0.35 + swing, 1.7);
        this.arm('R', 0.25, 0.35 - swing, 1.7);
        break;
      }
      case 'dj': {
        // one hand on the deck, the other up every few beats
        const raise = Math.max(0, Math.sin((TAU * beat) / 8));
        this.arm('L', 0.3, 0.9, 0.9 + 0.1 * onBeat);
        this.arm('R', 0.3 + 2.3 * raise, 0.9 * (1 - raise), 0.9 * (1 - raise) + 0.2);
        break;
      }
      default: {
        // groove: elbows bent in front, swinging in turn
        const a = 0.35 * half * e;
        this.arm('L', 0.3, 0.45 + a, 1.5 - 0.3 * onBeat);
        this.arm('R', 0.3, 0.45 - a, 1.5 - 0.3 * onBeat);
      }
    }
    this.pose('HandL', []);
    this.pose('HandR', []);
  }

  // Robe panels follow the legs so a bent knee doesn't poke through
  private followRobe() {
    for (const [panel, leg, amount] of this.robe) panel.quaternion.slerpQuaternions(IDENTITY, leg.quaternion, amount);
  }

  headPosition(target: THREE.Vector3) {
    if (!this.head) return target.copy(this.root.position).setY(this.root.position.y + CHARACTER_HEIGHT);
    return this.head.getWorldPosition(target);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
  }
}
