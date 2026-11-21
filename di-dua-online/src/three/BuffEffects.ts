/**
 * The look of a runner's buffs, attached to their root group:
 *  - flying (gift): a lightning bolt strikes from the sky when it starts, then blue electric sparks crackle
 *    around the body for as long as they fly;
 *  - turbo (cheers, hearts): a nitro burst ring when it starts, then flames at the heels and a fire trail on
 *    the track behind them.
 * Everything is camera-facing sprites or flat planes drawn from small canvas textures made once and shared.
 */
import * as THREE from 'three';

const BOLT_HEIGHT = 16; // metres of sky the strike comes down from
const STRIKE_SECONDS = 0.5;
const BURST_SECONDS = 0.45;
const SPARK_SWAP_S = 0.06; // a new crackle pattern this often
const VARIANTS = 4;
const AURA_BLINK_HZ = 5; // red duel outline at the photo finish

function texture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function jagged(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, steps: number, wobble: number) {
  g.beginPath();
  g.moveTo(x0, y0);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    g.lineTo(x0 + (x1 - x0) * t + (Math.random() - 0.5) * wobble, y0 + (y1 - y0) * t + (Math.random() - 0.5) * wobble * 0.3);
  }
  g.lineTo(x1, y1);
  g.stroke();
}

// Deep blue/violet glow under a white core: reads against the bright daytime sky as well as the red track
function glowStroke(g: CanvasRenderingContext2D, draw: () => void) {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const [width, color] of [
    [18, 'rgba(90,40,255,0.35)'],
    [10, 'rgba(40,110,255,0.85)'],
    [4, '#ffffff'],
  ] as const) {
    g.lineWidth = width;
    g.strokeStyle = color;
    draw();
  }
}

let shared: { bolts: THREE.Texture[]; sparks: THREE.Texture[]; flame: THREE.Texture; trail: THREE.Texture; ring: THREE.Texture; aura: THREE.Texture } | null = null;

function textures() {
  if (shared) return shared;
  const bolts = Array.from({ length: VARIANTS }, () =>
    texture(128, 1024, (g) =>
      glowStroke(g, () => {
        jagged(g, 64, 0, 64, 1024, 14, 70);
        jagged(g, 64, 380, 64 + (Math.random() - 0.5) * 100, 640, 5, 40); // a fork
      })
    )
  );
  const sparks = Array.from({ length: VARIANTS }, () =>
    texture(256, 256, (g) =>
      glowStroke(g, () => {
        for (let i = 0; i < 4; i++) {
          const a = Math.random() * Math.PI * 2;
          const r0 = 60 + Math.random() * 20;
          const r1 = 100 + Math.random() * 25;
          jagged(g, 128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0, 128 + Math.cos(a + 0.8) * r1, 128 + Math.sin(a + 0.8) * r1, 5, 26);
        }
      })
    )
  );
  const flame = texture(64, 128, (g) => {
    const grad = g.createRadialGradient(32, 96, 2, 32, 80, 60);
    grad.addColorStop(0, 'rgba(255,255,220,1)');
    grad.addColorStop(0.25, 'rgba(255,210,60,0.95)');
    grad.addColorStop(0.6, 'rgba(255,90,20,0.7)');
    grad.addColorStop(1, 'rgba(255,40,0,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(32, 0);
    g.quadraticCurveTo(64, 70, 50, 110);
    g.quadraticCurveTo(32, 128, 14, 110);
    g.quadraticCurveTo(0, 70, 32, 0);
    g.fill();
  });
  const trail = texture(64, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, 'rgba(255,240,150,0.95)');
    grad.addColorStop(0.3, 'rgba(255,120,20,0.75)');
    grad.addColorStop(1, 'rgba(255,40,0,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(14, 0);
    g.lineTo(50, 0);
    g.lineTo(36, 256);
    g.lineTo(28, 256);
    g.fill();
  });
  const ring = texture(128, 128, (g) => {
    const grad = g.createRadialGradient(64, 64, 30, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.7, 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  });
  // A body-shaped red outline glow: dark red edge, bright red band, white-hot rim, hollow middle
  const aura = texture(128, 256, (g) => {
    g.lineJoin = 'round';
    for (const [width, color] of [
      [26, 'rgba(120,0,0,0.35)'],
      [16, 'rgba(255,20,20,0.85)'],
      [6, 'rgba(255,230,200,1)'],
    ] as const) {
      g.lineWidth = width;
      g.strokeStyle = color;
      g.beginPath();
      g.ellipse(64, 128, 46, 108, 0, 0, Math.PI * 2);
      g.stroke();
    }
  });
  shared = { bolts, sparks, flame, trail, ring, aura };
  return shared;
}

const additive = (map: THREE.Texture, color = 0xffffff) =>
  new THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });

const flatAdditive = (map: THREE.Texture, color = 0xffffff) =>
  new THREE.MeshBasicMaterial({ map, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });

export class BuffEffects {
  private readonly tex = textures();
  private readonly bolt: THREE.Sprite;
  private readonly sparks: THREE.Sprite;
  private readonly flames: THREE.Sprite[];
  private readonly trail: THREE.Mesh;
  private readonly strikeRing: THREE.Mesh;
  private readonly burstRing: THREE.Mesh;
  private readonly aura: THREE.Sprite;
  private strikeLeft = 0;
  private burstLeft = 0;
  private sparkSwap = 0;
  private t = 0;

  constructor(
    root: THREE.Group,
    private readonly bodyHeight: number
  ) {
    // normal blending: an additive bolt vanishes against the light sky
    this.bolt = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.bolts[0], transparent: true, depthWrite: false }));
    this.bolt.scale.set(2.6, BOLT_HEIGHT, 1);
    this.bolt.visible = false;

    this.sparks = new THREE.Sprite(additive(this.tex.sparks[0], 0x9fd8ff));
    this.sparks.scale.setScalar(bodyHeight * 1.7);
    this.sparks.visible = false;

    this.flames = [-1, 1].map((side) => {
      const s = new THREE.Sprite(additive(this.tex.flame));
      s.position.set(side * 0.13, 0.28, -0.32);
      s.scale.set(0.45, 0.8, 1);
      s.visible = false;
      return s;
    });

    this.trail = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 4), flatAdditive(this.tex.trail));
    this.trail.rotation.x = Math.PI / 2; // flat on the track, the bright end at the heels
    this.trail.position.set(0, 0.03, -2.2);
    this.trail.visible = false;

    this.strikeRing = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), flatAdditive(this.tex.ring, 0x9fd8ff));
    this.strikeRing.rotation.x = -Math.PI / 2;
    this.strikeRing.position.y = 0.04;
    this.strikeRing.visible = false;

    this.burstRing = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), flatAdditive(this.tex.ring, 0xffa030));
    this.burstRing.position.set(0, bodyHeight * 0.5, -0.2); // stands up behind them, like an exhaust blast
    this.burstRing.visible = false;

    // normal blending: an additive red would vanish into the red track
    this.aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.aura, transparent: true, depthWrite: false }));
    this.aura.scale.set(bodyHeight * 0.95, bodyHeight * 1.5, 1);
    this.aura.visible = false;

    root.add(this.bolt, this.sparks, ...this.flames, this.trail, this.strikeRing, this.burstRing, this.aura);
  }

  /** A flight just started: lightning from the sky. */
  strike() {
    this.strikeLeft = STRIKE_SECONDS;
  }

  /** A speed boost just started: a nitro blast. */
  burst() {
    this.burstLeft = BURST_SECONDS;
  }

  /** `lift` = how high the body is right now. Neck and neck at the finish: a red outline blinks around the body (`duel`). */
  update(dt: number, flying: boolean, turbo: boolean, lift: number, duel = false) {
    this.updateAura(duel, lift);
    this.t += dt;
    this.updateStrike(dt, lift);
    this.updateSparks(dt, flying, lift);
    this.updateNitro(dt, turbo, lift);
  }

  private updateStrike(dt: number, lift: number) {
    const on = this.strikeLeft > 0;
    this.strikeLeft -= dt;
    this.strikeRing.visible = on;
    // flickers on and off while it lasts, a different bolt each flash
    this.bolt.visible = on && Math.floor(this.t * 30) % 3 !== 2;
    if (!on) return;
    const mat = this.bolt.material as THREE.SpriteMaterial;
    mat.map = this.tex.bolts[Math.floor(this.t * 30) % VARIANTS];
    this.bolt.position.y = lift + this.bodyHeight * 0.6 + BOLT_HEIGHT / 2;
    const k = 1 - this.strikeLeft / STRIKE_SECONDS;
    this.strikeRing.scale.setScalar(0.5 + k * 4);
    (this.strikeRing.material as THREE.MeshBasicMaterial).opacity = 1 - k;
  }

  // Blinks hard (on/off AURA_BLINK_HZ times a second) and pulses in size while on
  private updateAura(duel: boolean, lift: number) {
    this.aura.visible = duel && Math.floor(this.t * AURA_BLINK_HZ * 2) % 2 === 0;
    if (!this.aura.visible) return;
    const pulse = 1 + 0.12 * Math.sin(this.t * 30);
    this.aura.scale.set(this.bodyHeight * 0.95 * pulse, this.bodyHeight * 1.5 * pulse, 1);
    this.aura.position.set(0, lift + this.bodyHeight * 0.55, 0.05);
  }

  private updateSparks(dt: number, flying: boolean, lift: number) {
    this.sparks.visible = flying && Math.random() > 0.15; // a little flicker
    if (!flying) return;
    this.sparkSwap -= dt;
    if (this.sparkSwap <= 0) {
      this.sparkSwap = SPARK_SWAP_S;
      (this.sparks.material as THREE.SpriteMaterial).map = this.tex.sparks[Math.floor(Math.random() * VARIANTS)];
      this.sparks.material.rotation = Math.random() * Math.PI * 2;
    }
    this.sparks.position.y = lift + this.bodyHeight * 0.5;
  }

  private updateNitro(dt: number, turbo: boolean, lift: number) {
    for (const [i, f] of this.flames.entries()) {
      f.visible = turbo;
      if (!turbo) continue;
      const flicker = 0.8 + 0.4 * Math.sin(this.t * 40 + i * 2) * Math.random();
      f.scale.set(0.65 * flicker, 1.25 * flicker, 1);
      f.position.y = lift + 0.4;
    }
    this.trail.visible = turbo && lift < 0.5; // fire on the track, not in the air
    if (this.trail.visible) (this.trail.material as THREE.MeshBasicMaterial).opacity = 0.75 + 0.25 * Math.sin(this.t * 25);

    const on = this.burstLeft > 0;
    this.burstLeft -= dt;
    this.burstRing.visible = on;
    if (!on) return;
    const k = 1 - this.burstLeft / BURST_SECONDS;
    this.burstRing.scale.setScalar(0.4 + k * 2.6);
    this.burstRing.position.y = lift + this.bodyHeight * 0.5;
    (this.burstRing.material as THREE.MeshBasicMaterial).opacity = 1 - k;
  }

  dispose() {
    for (const o of [this.bolt, this.sparks, ...this.flames, this.aura]) o.material.dispose();
    for (const m of [this.trail, this.strikeRing, this.burstRing]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  }
}
