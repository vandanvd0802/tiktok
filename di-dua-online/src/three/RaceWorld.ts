/**
 * The stadium: a straight 8-lane track (start line far away, finish line near the camera end, z = 0), hurdles
 * across every lane, grandstands on both sides and behind the start (the generated stadium picture, or the
 * owner's own background), sky, light, and a confetti burst for the winner.
 * World axes: x across the lanes, z along the track (runners run toward +z), y up.
 */
import * as THREE from 'three';
import { HURDLES, LANES, TRACK_LENGTH } from '../domain/race';

export const LANE_WIDTH = 1.0;
export const START_Z = -TRACK_LENGTH;
export const FINISH_Z = 0;
const TRACK_HALF = (LANES * LANE_WIDTH) / 2 + 0.4;
const STAND_GAP = 3.2; // grass between the track edge and the stands
const STAND_HEIGHT = 13;
const STAND_LENGTH = TRACK_LENGTH + 60;
const HURDLE_HEIGHT = 0.55;
const DEFAULT_BACKDROP = '/assets/race/stadium-backdrop.jpg';
const CONFETTI_COUNT = 400;
const CONFETTI_COLORS = [0xff2d55, 0xffd60a, 0x34c759, 0x0a84ff, 0xbf5af2, 0xffffff];

export const laneX = (lane: number) => (lane - (LANES - 1) / 2) * LANE_WIDTH;
export const trackZ = (distance: number) => START_Z + distance;

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

type Hurdle = { group: THREE.Group; down: number }; // down: 0 standing .. 1 knocked flat

export class RaceWorld {
  private readonly hurdles = new Map<string, Hurdle>();
  private readonly standMaterial: THREE.MeshBasicMaterial;
  private readonly defaultBackdrop: THREE.Texture;
  private readonly confetti: THREE.Points;
  private readonly confettiVel: Float32Array;
  private confettiLife = 0;
  private readonly flags: THREE.Mesh[] = [];

  constructor(private readonly scene: THREE.Scene) {
    scene.background = new THREE.Color(0x8fd3ff);
    scene.fog = new THREE.Fog(0x8fd3ff, 70, 190);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x5a8a3a, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(-6, 14, 8);
    scene.add(sun);

    this.defaultBackdrop = new THREE.TextureLoader().load(DEFAULT_BACKDROP);
    this.defaultBackdrop.colorSpace = THREE.SRGBColorSpace;
    this.defaultBackdrop.wrapS = THREE.RepeatWrapping;
    this.standMaterial = new THREE.MeshBasicMaterial({ map: this.defaultBackdrop, fog: true });

    this.buildGround();
    this.buildTrack();
    this.buildStands();
    this.buildFinish();
    this.buildHurdles();
    const { points, velocities } = this.buildConfetti();
    this.confetti = points;
    this.confettiVel = velocities;
  }

  setBackground(url: string) {
    if (!url) {
      this.setStandTexture(this.defaultBackdrop);
      return;
    }
    new THREE.TextureLoader().load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      this.setStandTexture(tex);
    });
  }

  /** Puts every hurdle back up (a new race). */
  resetHurdles() {
    for (const h of this.hurdles.values()) h.down = 0;
  }

  knockHurdle(lane: number, index: number) {
    const h = this.hurdles.get(`${lane}:${index}`);
    if (h) h.down = Math.max(h.down, 0.01);
  }

  burstConfetti(at: THREE.Vector3) {
    const pos = this.confetti.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      pos.setXYZ(i, at.x + (Math.random() - 0.5) * 6, at.y + Math.random() * 2, at.z + (Math.random() - 0.5) * 3);
      this.confettiVel[i * 3] = (Math.random() - 0.5) * 6;
      this.confettiVel[i * 3 + 1] = 4 + Math.random() * 7;
      this.confettiVel[i * 3 + 2] = (Math.random() - 0.5) * 6;
    }
    pos.needsUpdate = true;
    this.confettiLife = 4;
    this.confetti.visible = true;
  }

  update(dt: number, time: number) {
    for (const h of this.hurdles.values()) {
      if (h.down <= 0 || h.down >= 1) continue;
      h.down = Math.min(1, h.down + dt * 4);
      h.group.rotation.x = (h.down * Math.PI) / 2; // tips over toward the finish
    }
    for (let i = 0; i < this.flags.length; i++) this.flags[i].rotation.y = Math.sin(time * 3 + i) * 0.25;
    this.updateConfetti(dt);
  }

  // --- building ------------------------------------------------------------------
  private buildGround() {
    const grassTex = canvasTexture(256, 256, (g) => {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? '#4caf50' : '#43a047';
        g.fillRect(0, i * 32, 256, 32);
      }
    });
    grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
    grassTex.repeat.set(4, 30);
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(80, STAND_LENGTH + 80), new THREE.MeshLambertMaterial({ map: grassTex }));
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(0, -0.02, START_Z / 2);
    this.scene.add(grass);
  }

  private buildTrack() {
    const length = TRACK_LENGTH + 50;
    const lanePx = 64;
    const tex = canvasTexture(lanePx * LANES + 32, 64, (g) => {
      g.fillStyle = '#c8492f';
      g.fillRect(0, 0, g.canvas.width, 64);
      g.fillStyle = '#ffffff';
      for (let i = 0; i <= LANES; i++) g.fillRect(16 + i * lanePx - 1.5, 0, 3, 64);
    });
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, length / 2);
    const width = LANES * LANE_WIDTH + (32 / lanePx) * LANE_WIDTH;
    const track = new THREE.Mesh(new THREE.PlaneGeometry(width, length), new THREE.MeshLambertMaterial({ map: tex }));
    track.rotation.x = -Math.PI / 2;
    track.position.set(0, 0, START_Z - 20 + length / 2);
    this.scene.add(track);

    // start line and lane numbers just behind it
    const start = new THREE.Mesh(new THREE.PlaneGeometry(LANES * LANE_WIDTH, 0.15), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    start.rotation.x = -Math.PI / 2;
    start.position.set(0, 0.01, START_Z);
    this.scene.add(start);
    for (let lane = 0; lane < LANES; lane++) {
      const num = canvasTexture(64, 64, (g) => {
        g.fillStyle = '#ffffff';
        g.font = 'bold 52px sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(lane + 1), 32, 34);
      });
      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ map: num, transparent: true }));
      label.rotation.x = -Math.PI / 2;
      label.position.set(laneX(lane), 0.01, START_Z - 1.2);
      this.scene.add(label);
    }
    // distance marks every 25 m
    for (let d = 25; d < TRACK_LENGTH; d += 25) {
      const mark = canvasTexture(256, 64, (g) => {
        g.fillStyle = '#ffffff';
        g.font = 'bold 48px sans-serif';
        g.textAlign = 'center';
        g.fillText(`${TRACK_LENGTH - d}m`, 128, 48);
      });
      for (const side of [-1, 1]) {
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshBasicMaterial({ map: mark, transparent: true }));
        sign.rotation.x = -Math.PI / 2;
        sign.position.set(side * (TRACK_HALF + 0.9), 0.01, trackZ(d));
        this.scene.add(sign);
      }
    }
  }

  private buildStands() {
    const repeat = STAND_LENGTH / (STAND_HEIGHT * 2);
    for (const side of [-1, 1]) {
      const geo = new THREE.PlaneGeometry(STAND_LENGTH, STAND_HEIGHT);
      const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * repeat);
      const stand = new THREE.Mesh(geo, this.standMaterial);
      stand.rotation.y = (-side * Math.PI) / 2; // faces the track
      stand.rotateX(-0.35); // leans back like terraces
      stand.position.set(side * (TRACK_HALF + STAND_GAP + 2), STAND_HEIGHT / 2 - 0.6, START_Z / 2 + 5);
      this.scene.add(stand);
      // advertising boards along the bottom
      const boards = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.7, STAND_LENGTH), new THREE.MeshLambertMaterial({ color: side < 0 ? 0x1e63d6 : 0xe23c5c }));
      boards.position.set(side * (TRACK_HALF + STAND_GAP - 0.4), 0.35, START_Z / 2 + 5);
      this.scene.add(boards);
    }
    const back = new THREE.Mesh(new THREE.PlaneGeometry(60, 26), this.standMaterial);
    back.position.set(0, 11, START_Z - 40);
    this.scene.add(back);
  }

  private buildFinish() {
    const checker = canvasTexture(256, 32, (g) => {
      for (let x = 0; x < 32; x++)
        for (let y = 0; y < 4; y++) {
          g.fillStyle = (x + y) % 2 ? '#111111' : '#ffffff';
          g.fillRect(x * 8, y * 8, 8, 8);
        }
    });
    const line = new THREE.Mesh(new THREE.PlaneGeometry(LANES * LANE_WIDTH, 0.6), new THREE.MeshBasicMaterial({ map: checker }));
    line.rotation.x = -Math.PI / 2;
    line.position.set(0, 0.012, FINISH_Z);
    this.scene.add(line);

    const postMat = new THREE.MeshLambertMaterial({ color: 0xf2f2f7 });
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 4.6, 12), postMat);
      post.position.set(side * (TRACK_HALF + 0.3), 2.3, FINISH_Z);
      this.scene.add(post);
    }
    const banner = canvasTexture(1024, 160, (g) => {
      const grad = g.createLinearGradient(0, 0, 1024, 0);
      grad.addColorStop(0, '#ff2d55');
      grad.addColorStop(0.5, '#ff9f0a');
      grad.addColorStop(1, '#ff2d55');
      g.fillStyle = grad;
      g.fillRect(0, 0, 1024, 160);
      g.fillStyle = '#ffffff';
      g.font = '900 110px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('🏁 VỀ ĐÍCH 🏁', 512, 86);
    });
    const width = TRACK_HALF * 2 + 0.6;
    const top = new THREE.Mesh(new THREE.BoxGeometry(width, 0.9, 0.2), [postMat, postMat, postMat, postMat, new THREE.MeshBasicMaterial({ map: banner }), new THREE.MeshBasicMaterial({ map: banner })]);
    top.position.set(0, 4.4, FINISH_Z);
    this.scene.add(top);
    // flags on top of the arch
    const flagColors = [0xff2d55, 0xffd60a, 0x34c759, 0x0a84ff, 0xbf5af2];
    for (let i = 0; i < flagColors.length; i++) {
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.45), new THREE.MeshLambertMaterial({ color: flagColors[i], side: THREE.DoubleSide }));
      flag.geometry.translate(0.35, 0, 0);
      flag.position.set(-width / 2 + 0.5 + (i * (width - 1)) / (flagColors.length - 1), 5.2, FINISH_Z);
      this.flags.push(flag);
      this.scene.add(flag);
    }
  }

  private buildHurdles() {
    const white = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const stripe = canvasTexture(128, 16, (g) => {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? '#ffffff' : '#ff2d2d';
        g.fillRect(i * 16, 0, 16, 16);
      }
    });
    const barMat = new THREE.MeshLambertMaterial({ map: stripe });
    const span = LANE_WIDTH * 0.8;
    const postGeo = new THREE.BoxGeometry(0.05, HURDLE_HEIGHT, 0.05);
    const footGeo = new THREE.BoxGeometry(0.05, 0.04, 0.4);
    const barGeo = new THREE.BoxGeometry(span, 0.12, 0.04);
    HURDLES.forEach((d, index) => {
      for (let lane = 0; lane < LANES; lane++) {
        const group = new THREE.Group();
        for (const side of [-1, 1]) {
          const post = new THREE.Mesh(postGeo, white);
          post.position.set((side * span) / 2, HURDLE_HEIGHT / 2, 0);
          const foot = new THREE.Mesh(footGeo, white);
          foot.position.set((side * span) / 2, 0.02, -0.15);
          group.add(post, foot);
        }
        const bar = new THREE.Mesh(barGeo, barMat);
        bar.position.y = HURDLE_HEIGHT - 0.06;
        group.add(bar);
        group.position.set(laneX(lane), 0, trackZ(d));
        this.scene.add(group);
        this.hurdles.set(`${lane}:${index}`, { group, down: 0 });
      }
    });
  }

  private buildConfetti() {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(CONFETTI_COUNT * 3);
    const colors = new Float32Array(CONFETTI_COUNT * 3);
    const c = new THREE.Color();
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      c.setHex(CONFETTI_COLORS[i % CONFETTI_COLORS.length]);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.16, vertexColors: true }));
    points.frustumCulled = false;
    points.visible = false;
    this.scene.add(points);
    return { points, velocities: new Float32Array(CONFETTI_COUNT * 3) };
  }

  private updateConfetti(dt: number) {
    if (this.confettiLife <= 0) return;
    this.confettiLife -= dt;
    const pos = this.confetti.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      const v = this.confettiVel;
      v[i * 3 + 1] = Math.max(-1.6, v[i * 3 + 1] - 9 * dt); // falls, then flutters down slowly
      v[i * 3] *= 0.99;
      v[i * 3 + 2] *= 0.99;
      pos.setXYZ(i, pos.getX(i) + v[i * 3] * dt, Math.max(0.02, pos.getY(i) + v[i * 3 + 1] * dt), pos.getZ(i) + v[i * 3 + 2] * dt);
    }
    pos.needsUpdate = true;
    if (this.confettiLife <= 0) this.confetti.visible = false;
  }

  private setStandTexture(tex: THREE.Texture) {
    this.standMaterial.map = tex;
    this.standMaterial.needsUpdate = true;
  }
}
