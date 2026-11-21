/**
 * Decides where the camera is. With nobody to follow it cuts to a random angle / zoom every few seconds
 * (wide, high, side, low, push-in, pull-back). While someone performs on the stage (gift, heart or keyword) it
 * follows them with a close-up whose angle and zoom change every few seconds. The scene eases towards each pose.
 */
import * as THREE from 'three';

export type CameraPose = { pos: THREE.Vector3; look: THREE.Vector3; fov: number };

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export const WIDE_POSE: CameraPose = { pos: v(0, 5.4, 11.6), look: v(0, 2.5, -1.2), fov: 46 };

// Crowd shots, all from the front half of the room so the camera never sees behind the set
const CROWD_SHOTS: readonly CameraPose[] = [
  WIDE_POSE,
  { pos: v(0, 3.6, 8.5), look: v(0, 1.8, -1.5), fov: 38 }, // push in
  { pos: v(0, 6.5, 14), look: v(0, 2.2, -1.5), fov: 54 }, // pull back
  { pos: v(-5.2, 3.2, 8), look: v(0.4, 1.6, -1.5), fov: 46 }, // from the left
  { pos: v(5.2, 3.2, 8), look: v(-0.4, 1.6, -1.5), fov: 46 }, // from the right
  { pos: v(0, 8.2, 9), look: v(0, 0.4, -1.8), fov: 48 }, // high
  { pos: v(2.4, 1.9, 7.6), look: v(-0.6, 1.2, -1.8), fov: 42 }, // low, in the crowd
  { pos: v(-2.4, 1.9, 7.6), look: v(0.6, 1.2, -1.8), fov: 42 },
];

const CROWD_SHOT_MS = { min: 7000, max: 15000 };
const CLOSE_SHOT_MS = { min: 3500, max: 6500 };
const CLOSE = {
  azimuth: 0.75, // radians either side of straight on
  distance: { min: 3.2, max: 6.2 },
  height: { min: 0.4, max: 1.5 },
  fov: { min: 30, max: 44 },
  lookHeight: 1.15,
};

const between = (r: { min: number; max: number }) => r.min + Math.random() * (r.max - r.min);

export class CameraDirector {
  private crowdShot = WIDE_POSE;
  private closeAngle = { azimuth: 0, distance: 5.4, height: 0.8, fov: 44 };
  private nextCutAt = 0;
  private followed: string | null = null;

  /** `focus` is who to follow (key + where they stand), or null for a crowd shot. */
  pose(now: number, focus: { key: string; position: THREE.Vector3 } | null): CameraPose {
    if (!focus) {
      this.followed = null;
      if (now >= this.nextCutAt) this.cutCrowd(now);
      return this.crowdShot;
    }
    if (focus.key !== this.followed || now >= this.nextCutAt) this.cutClose(now, focus.key);
    const look = v(focus.position.x, focus.position.y + CLOSE.lookHeight, focus.position.z);
    const { azimuth, distance, height, fov } = this.closeAngle;
    const pos = v(look.x + Math.sin(azimuth) * distance, look.y - CLOSE.lookHeight + height, look.z + Math.cos(azimuth) * distance);
    return { pos, look, fov };
  }

  private cutCrowd(now: number) {
    const others = CROWD_SHOTS.filter((s) => s !== this.crowdShot);
    this.crowdShot = others[Math.floor(Math.random() * others.length)];
    this.nextCutAt = now + between(CROWD_SHOT_MS);
  }

  private cutClose(now: number, key: string) {
    this.followed = key;
    this.closeAngle = {
      azimuth: (Math.random() * 2 - 1) * CLOSE.azimuth,
      distance: between(CLOSE.distance),
      height: between(CLOSE.height),
      fov: between(CLOSE.fov),
    };
    this.nextCutAt = now + between(CLOSE_SHOT_MS);
  }
}
