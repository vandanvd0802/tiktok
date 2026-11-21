/**
 * Runs the 3D race: drives the session clock every frame, keeps one RunnerActor per runner of the current
 * race, places them from the race rules, follows the pack with the camera, and draws name tags as DOM.
 */
import * as THREE from 'three';
import type { RaceSession } from '../application/RaceSession';
import type { Race, Runner } from '../domain/race';
import type { CharacterAssets } from './characterAssets';
import { FINISH_Z, laneX, RaceWorld, START_Z, trackZ } from './RaceWorld';
import { RunnerActor, type RunnerPose } from './RunnerActor';

type Member = { actor: RunnerActor; skin: string; tag: HTMLElement; nextHurdle: number; flying: boolean; flyUntil: number; turboUntil: number };

const CAMERA = {
  lobby: { pos: new THREE.Vector3(9, 7, START_Z + 16), look: new THREE.Vector3(0, 0.5, START_Z) },
  chase: { height: 8.5, ahead: 13, lookBehind: 7 }, // in front of the leader, looking back at the runners' faces
  finish: { pos: new THREE.Vector3(0, 6, FINISH_Z + 17), look: new THREE.Vector3(0, 0.8, FINISH_Z) },
  photoFinish: { side: 1.2, height: 1.7, ahead: 7, fov: 40 }, // relative to the two leaders
  fov: 58,
};
const PHOTO_FINISH_LEGS = 0.4; // legs move in slow motion too
const CAMERA_EASE = 4;
const RUN_OUT = { metres: 4.5, speed: 3 }; // finishers slow to a stop just past the line
const FULL_SPEED = 7; // m/s that matches the sprint clip at 1x

// Name tag with the lane number viewers type to cheer
function makeTag(runner: Readonly<Runner>): HTMLElement {
  const tag = document.createElement('div');
  tag.className = runner.bot ? 'race-tag race-tag--bot' : 'race-tag';
  const lane = document.createElement('b');
  lane.textContent = String(runner.lane + 1);
  tag.appendChild(lane);
  if (runner.avatar) {
    const img = document.createElement('img');
    img.src = runner.avatar;
    img.referrerPolicy = 'no-referrer';
    tag.appendChild(img);
  }
  const span = document.createElement('span');
  span.textContent = runner.name; // viewer text: never innerHTML
  tag.appendChild(span);
  return tag;
}

export class RaceScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(CAMERA.fov, 9 / 16, 0.1, 260);
  private readonly world: RaceWorld;
  private readonly members = new Map<string, Member>();
  private shownRace: Race | null = null;
  private celebrated = false;
  private readonly camPos = CAMERA.lobby.pos.clone();
  private readonly camLook = CAMERA.lobby.look.clone();
  private readonly clock = new THREE.Clock();
  private frame = 0;
  private frames = 0;
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly tagLayer: HTMLElement,
    private readonly assets: CharacterAssets,
    private readonly session: RaceSession
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.world = new RaceWorld(this.scene);
    this.resize();
    this.loop();
  }

  setBackground(url: string) {
    this.world.setBackground(url);
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.clearRunners();
    this.renderer.dispose();
  }

  // --- frame ----------------------------------------------------------------------
  loop = () => {
    this.frame = requestAnimationFrame(this.loop);
    if (this.frames++ % 30 === 0) this.resize();
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.session.tick(dt);
    const race = this.session.race();
    if (race !== this.shownRace) this.showRace(race);
    if (race) this.updateRunners(race, dt);
    this.world.update(dt, this.clock.elapsedTime);
    this.updateCamera(race, dt);
    this.renderer.render(this.scene, this.camera);
    this.placeTags();
  };

  private showRace(race: Race | null) {
    this.clearRunners();
    this.shownRace = race;
    this.celebrated = false;
    this.world.resetHurdles();
    if (!race) return;
    for (const r of race.runners) {
      const actor = this.makeActor(r);
      const tag = makeTag(r);
      this.tagLayer.appendChild(tag);
      this.members.set(r.key, { actor, skin: r.skin, tag, nextHurdle: 0, flying: false, flyUntil: r.flyUntil, turboUntil: r.turboUntil });
    }
  }

  private makeActor(r: Readonly<Runner>): RunnerActor {
    const actor = new RunnerActor(this.assets.get(r.skin)!);
    this.scene.add(actor.root);
    return actor;
  }

  // The viewer asked for another character: same runner, new body, with a flash so the change is seen
  private changeSkin(m: Member, r: Readonly<Runner>) {
    this.scene.remove(m.actor.root);
    m.actor.dispose();
    m.actor = this.makeActor(r);
    m.skin = r.skin;
    m.actor.strike();
  }

  private clearRunners() {
    for (const m of this.members.values()) {
      m.tag.remove();
      this.scene.remove(m.actor.root);
      m.actor.dispose();
    }
    this.members.clear();
  }

  private updateRunners(race: Race, dt: number) {
    const order = race.standings();
    // photo finish: the two leaders get the blinking red outline
    const duel = new Set(this.session.slowMotion() ? order.slice(0, 2).map((r) => r.key) : []);
    for (const r of race.runners) {
      const m = this.members.get(r.key);
      if (!m) continue;
      if (m.skin !== r.skin) this.changeSkin(m, r);
      // a hurdle just passed on foot without hopping was knocked over
      while (m.nextHurdle < r.nextHurdle) {
        if (race.isTripping(r)) this.world.knockHurdle(r.lane, m.nextHurdle);
        m.nextHurdle++;
      }
      // a new (or longer) flight = lightning, a new speed boost = nitro blast
      if (r.flyUntil > m.flyUntil + 0.05) m.actor.strike();
      if (r.turboUntil > m.turboUntil + 0.05) m.actor.burst();
      m.flyUntil = r.flyUntil;
      m.turboUntil = r.turboUntil;
      m.flying = race.isFlying(r);
      m.actor.update(dt, { ...this.pose(race, r), duel: duel.has(r.key) });
      const rank = order.indexOf(r) + 1;
      m.tag.classList.toggle('race-tag--duel', duel.has(r.key));
      m.tag.classList.toggle('race-tag--flying', m.flying);
      m.tag.classList.toggle('race-tag--turbo', race.isTurbo(r) && !m.flying);
      m.tag.classList.toggle('race-tag--first', rank === 1 && race.started);
      m.tag.classList.toggle('race-tag--crown', r.key === this.session.getState().crown);
    }
    const winner = order[0];
    if (!this.celebrated && winner?.place === 1) {
      this.celebrated = true;
      this.world.burstConfetti(new THREE.Vector3(0, 3, FINISH_Z + 2));
    }
  }

  private pose(race: Race, r: Readonly<Runner>): RunnerPose {
    const x = laneX(r.lane);
    if (r.finishedAt !== null) {
      const runOut = Math.min(RUN_OUT.metres, (race.time - r.finishedAt) * RUN_OUT.speed);
      const motion = runOut >= RUN_OUT.metres ? 'cheer' : 'run';
      return { x, z: FINISH_Z + runOut, motion, hop: null, flying: false, turbo: false, speedFactor: 0.8 };
    }
    if (!race.started) return { x, z: START_Z, motion: 'ready', hop: null, flying: race.isFlying(r), turbo: race.isTurbo(r), speedFactor: 1 };
    return {
      x,
      z: trackZ(r.distance),
      motion: race.isTripping(r) ? 'trip' : 'run',
      hop: race.hopProgress(r),
      flying: race.isFlying(r),
      turbo: race.isTurbo(r),
      speedFactor: Math.max(0.8, r.baseSpeed / FULL_SPEED) * (this.session.slowMotion() ? PHOTO_FINISH_LEGS : 1),
    };
  }

  // --- camera -----------------------------------------------------------------------
  private updateCamera(race: Race | null, dt: number) {
    const { pos, look, fov = CAMERA.fov } = this.cameraTarget(race);
    const k = Math.min(1, dt * CAMERA_EASE);
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * k;
      this.camera.updateProjectionMatrix();
    }
  }

  private cameraTarget(race: Race | null): { pos: THREE.Vector3; look: THREE.Vector3; fov?: number } {
    if (!race) return CAMERA.lobby;
    const running = race.standings().filter((r) => r.finishedAt === null);
    if (this.session.slowMotion() && running.length >= 2) {
      // low and close in front of the two leaders, zoomed in, so the gap between them reads
      const [a, b] = running;
      const x = (laneX(a.lane) + laneX(b.lane)) / 2;
      const z = trackZ(a.distance);
      const p = CAMERA.photoFinish;
      return { pos: new THREE.Vector3(x + p.side, p.height, z + p.ahead), look: new THREE.Vector3(x, 0.8, z - 1), fov: p.fov };
    }
    if (race.over || !running.length) return CAMERA.finish;
    // ahead of the leader still running, looking back past them at the pack: the leader sits in the lower third
    const leadZ = Math.min(FINISH_Z, trackZ(running[0].distance));
    const c = CAMERA.chase;
    return { pos: new THREE.Vector3(0, c.height, leadZ + c.ahead), look: new THREE.Vector3(0, 0.6, leadZ - c.lookBehind) };
  }

  // --- tags ---------------------------------------------------------------------------
  private placeTags() {
    const p = this.tmp;
    for (const m of this.members.values()) {
      m.actor.headPosition(p);
      p.project(this.camera);
      const visible = p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1;
      m.tag.style.display = visible ? '' : 'none';
      if (!visible) continue;
      m.tag.style.left = `${((p.x + 1) / 2) * 100}%`;
      m.tag.style.top = `${((1 - p.y) / 2) * 100}%`;
      m.tag.style.zIndex = String(Math.round((1 - p.z) * 10000) + (m.flying ? 100000 : 0));
    }
  }

  private resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    const zoom = this.canvas.getBoundingClientRect().width / w || 1;
    // never render wider than the 1080 px the live is sent at
    const ratio = Math.min(window.devicePixelRatio * zoom, 2, 1080 / w);
    if (this.renderer.getPixelRatio() !== ratio) this.renderer.setPixelRatio(ratio);
    const size = this.renderer.getSize(new THREE.Vector2());
    if (size.x !== w || size.y !== h) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }
}

