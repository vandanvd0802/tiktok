/**
 * The room: LED dance floor, raised DJ stage with a booth, LED wall, neon tubes, moving light beams,
 * lasers (party mode), a disco ball with light specks, and confetti. Everything animates on the beat.
 */
import * as THREE from 'three';
import { FLOOR } from '../domain/dancefloor';

export const STAGE = { front: -3.75, back: -5.9, height: 0.5, halfWidth: 3.0 } as const;
const WALL_Z = -6.4;
const TILE = 0.64;
const BEAM_COUNT = 6;
const LASER_COUNT = 10;
const CONFETTI = 260;
const SPECKS = 90;
const PALETTE = [0xff2d95, 0x2d7dff, 0x9b4dff, 0x10d0c0, 0xffc83d, 0xff5a1f];

const color = (hex: number) => new THREE.Color(hex);

function radialTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// Beam texture: bright at the top, fading toward the floor
function beamTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(255,255,255,0.0)');
  grad.addColorStop(0.08, 'rgba(255,255,255,0.75)');
  grad.addColorStop(1, 'rgba(255,255,255,0.0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(c);
}

export class ClubWorld {
  readonly group = new THREE.Group();
  private tiles!: THREE.InstancedMesh;
  private tileCoords: Array<{ c: number; r: number }> = [];
  private beams: Array<{ pivot: THREE.Group; mat: THREE.MeshBasicMaterial; base: number; speed: number }> = [];
  private lasers!: THREE.Group;
  private laserMats: THREE.MeshBasicMaterial[] = [];
  private ball!: THREE.Mesh;
  private specks!: THREE.Points;
  private confetti!: THREE.InstancedMesh;
  private confettiState: Array<{ p: THREE.Vector3; v: THREE.Vector3; r: THREE.Euler; spin: number; alive: boolean }> = [];
  private lights: THREE.PointLight[] = [];
  private stageLight!: THREE.SpotLight;
  private wallMat!: THREE.MeshBasicMaterial;
  private led!: { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; mesh: THREE.Mesh };
  private customWall: THREE.Mesh | null = null;
  private flash = 0;
  private lastBeat = -1;
  private pattern = 0;
  private readonly tmpColor = new THREE.Color();
  private readonly tmpMatrix = new THREE.Matrix4();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly one = new THREE.Vector3(1, 1, 1);

  constructor(private readonly scene: THREE.Scene) {
    scene.fog = new THREE.FogExp2(0x0b0614, 0.045);
    scene.background = new THREE.Color(0x05030a);
    this.buildRoom();
    this.buildDanceFloor();
    this.buildStage();
    this.buildLights();
    this.buildBeams();
    this.buildLasers();
    this.buildDiscoBall();
    this.buildConfetti();
    scene.add(this.group);
  }

  // --- build ------------------------------------------------------------------
  private buildRoom() {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 16), new THREE.MeshStandardMaterial({ color: 0x0c0a12, roughness: 0.35, metalness: 0.4 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -1;
    this.group.add(floor);

    this.wallMat = new THREE.MeshBasicMaterial({ color: 0x0d0818 });
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 9), this.wallMat);
    wall.position.set(0, 4.5, WALL_Z);
    this.group.add(wall);
    for (const side of [-1, 1]) {
      const sideWall = new THREE.Mesh(new THREE.PlaneGeometry(16, 9), new THREE.MeshStandardMaterial({ color: 0x0b0812, roughness: 0.9 }));
      sideWall.rotation.y = -side * Math.PI / 2;
      sideWall.position.set(side * 5.2, 4.5, -1);
      this.group.add(sideWall);
      // neon tubes on the side walls
      for (let i = 0; i < 4; i++) {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 3.2, 8), new THREE.MeshBasicMaterial({ color: PALETTE[(i + (side > 0 ? 2 : 0)) % PALETTE.length] }));
        tube.position.set(side * 5.1, 2.1, -5 + i * 2.2);
        this.group.add(tube);
      }
    }

    // LED wall behind the DJ: equalizer bars, redrawn on the beat
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 3.3), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    mesh.position.set(0, 2.9, WALL_Z + 0.02);
    this.group.add(mesh);
    this.led = { canvas, tex, mesh };
    // frame
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(6.9, 3.6), new THREE.MeshBasicMaterial({ color: 0x1a1030 }));
    frame.position.set(0, 2.9, WALL_Z + 0.01);
    this.group.add(frame);
  }

  private buildDanceFloor() {
    const cols = Math.round((FLOOR.halfWidth * 2) / TILE);
    const rows = Math.round((FLOOR.front - FLOOR.back) / TILE);
    const geo = new THREE.BoxGeometry(TILE * 0.94, 0.04, TILE * 0.94);
    this.tiles = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ toneMapped: false }), cols * rows);
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = -FLOOR.halfWidth + (c + 0.5) * TILE;
        const z = FLOOR.back + (r + 0.5) * TILE;
        this.tmpMatrix.makeTranslation(x, 0.0, z);
        this.tiles.setMatrixAt(i, this.tmpMatrix);
        this.tiles.setColorAt(i, color(0x000000));
        this.tileCoords.push({ c, r });
        i++;
      }
    }
    this.group.add(this.tiles);
  }

  private buildStage() {
    const depth = STAGE.back - STAGE.front;
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(STAGE.halfWidth * 2, STAGE.height, Math.abs(depth)),
      new THREE.MeshStandardMaterial({ color: 0x16121f, roughness: 0.4, metalness: 0.5 })
    );
    deck.position.set(0, STAGE.height / 2, (STAGE.front + STAGE.back) / 2);
    this.group.add(deck);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(STAGE.halfWidth * 2, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0xff2d95, toneMapped: false }));
    edge.position.set(0, STAGE.height, STAGE.front);
    edge.name = 'stageEdge';
    this.group.add(edge);
    // a step in the middle of the front edge
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.2, STAGE.height / 2, 0.45), deck.material);
    step.position.set(0, STAGE.height / 4, STAGE.front + 0.22);
    this.group.add(step);

    // DJ booth
    const booth = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.0, 0.7), new THREE.MeshStandardMaterial({ color: 0x0d0b14, roughness: 0.5, metalness: 0.6 }));
    booth.position.set(0, STAGE.height + 0.5, -5.05);
    this.group.add(booth);
    for (let i = 0; i < 5; i++) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.05), new THREE.MeshBasicMaterial({ color: PALETTE[i % PALETTE.length], toneMapped: false }));
      strip.position.set(0, STAGE.height + 0.15 + i * 0.17, -4.695);
      strip.name = 'boothStrip';
      this.group.add(strip);
    }
    for (const x of [-0.55, 0.55]) {
      const deckTop = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 24), new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.3 }));
      deckTop.position.set(x, STAGE.height + 1.02, -5.05);
      this.group.add(deckTop);
    }
    // speakers
    for (const x of [-2.5, 2.5]) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 0.6), new THREE.MeshStandardMaterial({ color: 0x0a0a0f, roughness: 0.7 }));
      box.position.set(x, STAGE.height + 0.8, -5.3);
      this.group.add(box);
      for (const y of [0.45, 1.15]) {
        const cone = new THREE.Mesh(new THREE.CircleGeometry(0.25, 24), new THREE.MeshStandardMaterial({ color: 0x1c1c22, metalness: 0.5, roughness: 0.4 }));
        cone.position.set(x, STAGE.height + y, -4.995);
        cone.name = 'speakerCone';
        this.group.add(cone);
      }
    }
  }

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight(0x8a7bff, 0x1a0b22, 0.9));
    const key = new THREE.DirectionalLight(0xffe9f5, 1.1);
    key.position.set(1.5, 8, 9);
    this.scene.add(key);
    for (let i = 0; i < 3; i++) {
      const light = new THREE.PointLight(PALETTE[i * 2], 18, 9, 1.6);
      light.position.set(-3 + i * 3, 3.2, -1);
      this.lights.push(light);
      this.scene.add(light);
    }
    this.stageLight = new THREE.SpotLight(0xffffff, 0, 14, 0.5, 0.5, 1);
    this.stageLight.position.set(0, 7, -1.5);
    this.stageLight.target.position.set(0, STAGE.height, -4.2);
    this.scene.add(this.stageLight, this.stageLight.target);
  }

  private buildBeams() {
    const tex = beamTexture();
    for (let i = 0; i < BEAM_COUNT; i++) {
      const pivot = new THREE.Group();
      const x = -4 + (8 * i) / (BEAM_COUNT - 1);
      pivot.position.set(x, 6.2, -3.2 + (i % 2) * 1.6);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        color: PALETTE[i % PALETTE.length],
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      });
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.9, 7.5, 24, 1, true), mat);
      cone.position.y = -3.75; // apex at the pivot
      pivot.add(cone);
      this.group.add(pivot);
      this.beams.push({ pivot, mat, base: (i / BEAM_COUNT) * Math.PI * 2, speed: 0.45 + (i % 3) * 0.12 });
    }
  }

  private buildLasers() {
    this.lasers = new THREE.Group();
    this.lasers.position.set(0, STAGE.height + 1.1, -5.2);
    for (let i = 0; i < LASER_COUNT; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: i % 2 ? 0x39ff6a : 0xff2d95, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 16, 4, 1, true), mat);
      beam.rotation.x = Math.PI / 2;
      beam.position.z = 8;
      const holder = new THREE.Group();
      holder.add(beam);
      holder.userData.index = i;
      this.lasers.add(holder);
      this.laserMats.push(mat);
    }
    this.lasers.visible = false;
    this.group.add(this.lasers);
  }

  private buildDiscoBall() {
    this.ball = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.45, 2),
      new THREE.MeshStandardMaterial({ color: 0xdedeea, metalness: 0.9, roughness: 0.18, flatShading: true, emissive: 0x221a33 })
    );
    this.ball.position.set(0, 5.4, -1.2);
    this.group.add(this.ball);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 2, 4), new THREE.MeshBasicMaterial({ color: 0x555555 }));
    chain.position.set(0, 6.6, -1.2);
    this.group.add(chain);

    // light specks the ball throws on the floor and walls
    const pos = new Float32Array(SPECKS * 3);
    for (let i = 0; i < SPECKS; i++) {
      const a = Math.random() * Math.PI * 2;
      const rad = 1 + Math.random() * 4.5;
      pos.set([Math.cos(a) * rad, 0.05 + Math.random() * 4, Math.sin(a) * rad], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.specks = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.12, map: radialTexture(), color: 0xffffff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.specks.position.set(0, 0, -1.2);
    this.group.add(this.specks);
  }

  private buildConfetti() {
    const geo = new THREE.PlaneGeometry(0.07, 0.11);
    this.confetti = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), CONFETTI);
    for (let i = 0; i < CONFETTI; i++) {
      this.confettiState.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), spin: 0, alive: false });
      this.confetti.setColorAt(i, color(PALETTE[i % PALETTE.length]));
      this.confetti.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
    }
    this.confetti.frustumCulled = false;
    this.group.add(this.confetti);
  }

  // --- control ----------------------------------------------------------------
  /** Custom background from the dashboard replaces the back wall (with the LED screen) by the image. */
  setBackground(url: string) {
    if (this.customWall) {
      this.group.remove(this.customWall);
      (this.customWall.material as THREE.MeshBasicMaterial).map?.dispose();
      this.customWall = null;
    }
    this.led.mesh.visible = !url;
    if (!url) return;
    new THREE.TextureLoader().load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      const aspect = tex.image.width / tex.image.height || 1;
      const h = 8;
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(h * aspect, h), new THREE.MeshBasicMaterial({ map: tex, fog: false, toneMapped: false }));
      wall.position.set(0, 3.6, WALL_Z + 0.03);
      this.customWall = wall;
      this.group.add(wall);
    });
  }

  /** Confetti shower from above (count = how many pieces, 0..CONFETTI). */
  burstConfetti(count: number) {
    let spawned = 0;
    for (const c of this.confettiState) {
      if (spawned >= count) break;
      if (c.alive) continue;
      c.alive = true;
      c.p.set((Math.random() - 0.5) * 8, 5 + Math.random() * 2.5, -4 + Math.random() * 6.5);
      c.v.set((Math.random() - 0.5) * 0.4, -0.6 - Math.random() * 0.6, 0);
      c.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      c.spin = 2 + Math.random() * 6;
      spawned++;
    }
  }

  strobe() {
    this.flash = 1;
  }

  /** Lights a performer on the stage (x on the stage) or switches the stage spot off (null). */
  spotOn(x: number | null) {
    this.stageLight.intensity = x === null ? 0 : 60;
    if (x !== null) this.stageLight.target.position.x = x;
  }

  update(dt: number, beat: number, party: boolean, time: number) {
    const onBeat = Math.pow(0.5 + 0.5 * Math.cos(Math.PI * 2 * beat), 3);
    const whole = Math.floor(beat);
    if (whole !== this.lastBeat) {
      this.lastBeat = whole;
      if (whole % 16 === 0) this.pattern = (this.pattern + 1) % 4;
      if (party && whole % 2 === 0) this.burstConfetti(14);
    }
    this.flash = Math.max(0, this.flash - dt * 1.4);
    this.updateTiles(beat, party);
    this.updateBeams(time, onBeat, party);
    this.updateLasers(time, party);
    this.updateLights(time, beat, onBeat);
    this.updateConfetti(dt);
    this.ball.rotation.y += dt * 0.6;
    this.specks.rotation.y += dt * 0.25;
    (this.specks.material as THREE.PointsMaterial).opacity = 0.45 + 0.4 * onBeat;
    this.wallMat.color.setRGB(0.05 + this.flash * 0.8, 0.03 + this.flash * 0.8, 0.09 + this.flash * 0.8);
    if (Math.floor(time * 20) !== Math.floor((time - dt) * 20)) this.drawLed(beat, party);
  }

  private updateTiles(beat: number, party: boolean) {
    const step = Math.floor(beat * (party ? 2 : 1));
    for (let i = 0; i < this.tileCoords.length; i++) {
      const { c, r } = this.tileCoords[i];
      let lit: boolean;
      let hue: number;
      switch (this.pattern) {
        case 0:
          lit = (c + r + step) % 2 === 0;
          hue = ((step % 6) / 6 + 0.02 * r) % 1;
          break;
        case 1:
          lit = (r + step) % 4 === 0 || (c + step) % 5 === 0;
          hue = (0.8 + 0.05 * c) % 1;
          break;
        case 2: {
          const d = Math.hypot(c - 5, r - 4.5);
          lit = Math.floor(d - beat * 2) % 3 === 0;
          hue = (d * 0.07 + beat * 0.05) % 1;
          break;
        }
        default:
          lit = ((c * 7 + r * 13 + step * 5) % 9) < 3;
          hue = ((c * 3 + r * 5 + step) % 12) / 12;
      }
      const v = lit ? 0.85 : 0.08;
      this.tmpColor.setHSL(hue, 1, v * 0.55 + this.flash * 0.4);
      this.tiles.setColorAt(i, this.tmpColor);
    }
    this.tiles.instanceColor!.needsUpdate = true;
  }

  private updateBeams(time: number, onBeat: number, party: boolean) {
    const speed = party ? 2.2 : 1;
    for (const [i, b] of this.beams.entries()) {
      const t = time * b.speed * speed + b.base;
      b.pivot.rotation.z = Math.sin(t) * 0.55;
      b.pivot.rotation.x = Math.cos(t * 0.8) * 0.35;
      b.mat.opacity = (party ? 0.38 : 0.24) + 0.18 * onBeat + this.flash * 0.5;
      const hue = ((i / this.beams.length + time * 0.03) % 1);
      if (this.flash > 0.2) b.mat.color.setRGB(1, 1, 1);
      else b.mat.color.setHSL(hue, 1, 0.55);
    }
  }

  private updateLasers(time: number, party: boolean) {
    this.lasers.visible = party || this.flash > 0.05;
    if (!this.lasers.visible) return;
    for (const holder of this.lasers.children) {
      const i = holder.userData.index as number;
      const spread = (i / (LASER_COUNT - 1) - 0.5) * 1.4;
      holder.rotation.y = spread + Math.sin(time * 1.3 + i) * 0.25;
      holder.rotation.x = -0.12 + Math.sin(time * 2 + i * 0.5) * 0.12;
    }
  }

  private updateLights(time: number, beat: number, onBeat: number) {
    for (const [i, l] of this.lights.entries()) {
      l.position.x = Math.sin(time * 0.7 + i * 2.1) * 3;
      l.position.z = -1 + Math.cos(time * 0.5 + i) * 2.5;
      l.color.setHSL(((beat / 16 + i / 3) % 1), 1, 0.55);
      l.intensity = 14 + 16 * onBeat + this.flash * 40;
    }
    const strips = this.group.children.filter((o) => o.name === 'boothStrip' || o.name === 'stageEdge');
    for (const [i, s] of strips.entries()) {
      ((s as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHSL(((beat / 8 + i * 0.12) % 1), 1, 0.45 + 0.2 * onBeat);
    }
    for (const s of this.group.children) {
      if (s.name === 'speakerCone') s.scale.setScalar(1 + 0.08 * onBeat);
    }
  }

  private updateConfetti(dt: number) {
    let any = false;
    for (let i = 0; i < this.confettiState.length; i++) {
      const c = this.confettiState[i];
      if (!c.alive) continue;
      any = true;
      c.p.addScaledVector(c.v, dt);
      c.p.x += Math.sin(c.r.x * 3) * dt * 0.3;
      c.r.x += c.spin * dt;
      c.r.y += c.spin * 0.7 * dt;
      if (c.p.y < 0.03) {
        c.alive = false;
        this.confetti.setMatrixAt(i, this.tmpMatrix.makeScale(0, 0, 0));
        continue;
      }
      this.tmpQuat.setFromEuler(c.r);
      this.confetti.setMatrixAt(i, this.tmpMatrix.compose(c.p, this.tmpQuat, this.one));
    }
    if (any) this.confetti.instanceMatrix.needsUpdate = true;
  }

  private drawLed(beat: number, party: boolean) {
    const { canvas, tex } = this.led;
    const g = canvas.getContext('2d')!;
    const w = canvas.width;
    const h = canvas.height;
    g.fillStyle = '#07040f';
    g.fillRect(0, 0, w, h);
    const bars = 32;
    const onBeat = Math.pow(0.5 + 0.5 * Math.cos(Math.PI * 2 * beat), 2);
    for (let i = 0; i < bars; i++) {
      const lvl = 0.25 + 0.55 * Math.abs(Math.sin(i * 0.7 + beat * (party ? 3.2 : 1.6))) * (0.6 + 0.4 * onBeat);
      const bh = lvl * h * 0.9;
      g.fillStyle = `hsl(${(i * 9 + beat * 20) % 360}, 100%, 55%)`;
      g.fillRect(i * (w / bars) + 2, h - bh, w / bars - 4, bh);
    }
    tex.needsUpdate = true;
  }
}
