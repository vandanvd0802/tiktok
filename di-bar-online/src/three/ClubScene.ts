/**
 * Runs the 3D bar: one Dancer per viewer on the floor, performers who walk up onto the stage when they gift
 * or type the keyword, a camera that closes in on gift givers, name tags drawn as DOM over the canvas.
 */
import * as THREE from 'three';
import type { GiftTier } from '../domain/gifts';
import { SPOTS, type Clubber } from '../domain/dancefloor';
import type { StageCall } from '../application/ClubSession';
import type { CharacterAssets } from './characterAssets';
import { ClubWorld, STAGE } from './ClubWorld';
import type { Actor } from './Actor';
import { AnimalActor } from './AnimalActor';
import { Dancer } from './Dancer';
import type { SkinId } from '../domain/skins';
import { nextWanderDelay, pickWanderTarget } from '../domain/wander';
import { CameraDirector, WIDE_POSE } from './CameraDirector';

export interface BeatSource {
  beat(): number;
}

type Member = { dancer: Actor; skin: SkinId; clubber: Clubber; tag: HTMLElement; performing: boolean; removeAfterShow: boolean; leaving: boolean; nextWanderAt: number };
type Show = { call: StageCall; member: Member; slot: number; until: number; onStage: boolean };

const STAGE_Y = STAGE.height;
const STAGE_SLOTS = [0, -1.15, 1.15, -2.2, 2.2];
const SLOT_Z = -4.35;
const ENTRY = new THREE.Vector3(0, 0, 5);
const SHOW_MS = { gift: 9000, keyword: 7000 };
const CONFETTI_BY_TIER: Record<GiftTier, number> = { small: 20, medium: 60, big: 140, huge: 260 };

function makeTag(name: string, avatar: string, performer: boolean): HTMLElement {
  const el = document.createElement('div');
  el.className = performer ? 'club-tag club-tag--performer' : 'club-tag';
  if (performer) {
    if (avatar) {
      const img = document.createElement('img');
      img.src = avatar;
      img.referrerPolicy = 'no-referrer';
      el.appendChild(img);
    }
  }
  const span = document.createElement('span');
  span.textContent = name; // viewer text: never innerHTML
  el.appendChild(span);
  return el;
}

export class ClubScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(46, 9 / 16, 0.1, 80);
  private readonly world: ClubWorld;
  private readonly dj: Dancer;
  private readonly members = new Map<string, Member>();
  private readonly seenCalls = new Set<string>();
  private queue: StageCall[] = [];
  private shows: Show[] = [];
  private focus: Show | null = null;
  private party = false;
  private readonly director = new CameraDirector();
  private readonly camPos = WIDE_POSE.pos.clone();
  private readonly camLook = WIDE_POSE.look.clone();
  private readonly clock = new THREE.Clock();
  private frame = 0;
  private frames = 0;
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly tagLayer: HTMLElement,
    private readonly assets: CharacterAssets,
    private readonly beats: BeatSource
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.world = new ClubWorld(this.scene);
    this.dj = new Dancer(assets, 8, 'dj');
    this.dj.root.position.set(0, STAGE_Y, -5.55);
    this.dj.baseY = STAGE_Y;
    this.scene.add(this.dj.root);
    this.resize();
    this.loop();
  }

  // --- inputs from React ----------------------------------------------------------
  setBackground(url: string) {
    this.world.setBackground(url);
  }

  setParty(on: boolean) {
    if (on === this.party) return;
    this.party = on;
    for (const m of this.members.values()) {
      m.dancer.energy = on ? 1.4 : 1;
      if (on && Math.random() < 0.5 && !m.performing) m.dancer.style = 'handsUp';
    }
    if (on) this.world.burstConfetti(200);
  }

  drop() {
    this.world.strobe();
    this.world.burstConfetti(160);
    for (const m of this.members.values()) m.dancer.jump(Math.random() * 0.15);
    this.dj.jump(0);
  }

  syncCrowd(crowd: Clubber[]) {
    const wanted = new Set(crowd.map((c) => c.key));
    for (const [key, m] of this.members) {
      if (wanted.has(key) || m.leaving) continue;
      if (m.performing) m.removeAfterShow = true;
      else if (m.clubber.bot) this.sendOut(m); // a bot steps out when real people take its place
      else this.removeMember(key);
    }
    for (const clubber of crowd) {
      const existing = this.members.get(clubber.key);
      if (existing) {
        if (existing.clubber.spot !== clubber.spot && !existing.performing) {
          existing.dancer.walkTo([this.spotPosition(clubber.spot)]);
        }
        existing.clubber = clubber;
        existing.removeAfterShow = false;
        if (existing.skin !== clubber.skin) this.changeSkin(existing, clubber.skin);
        continue;
      }
      this.addMember(clubber);
    }
  }

  stageCalls(calls: StageCall[]) {
    for (const call of calls) {
      if (this.seenCalls.has(call.id)) continue;
      this.seenCalls.add(call.id);
      // someone already up there (or waiting) is not queued twice; a gift upgrades their show
      const show = this.shows.find((s) => s.call.key === call.key);
      if (show) {
        if (call.gift) {
          show.call = call;
          show.until = performance.now() + SHOW_MS.gift;
          this.celebrate(call.gift.tier);
        }
        continue;
      }
      const waiting = this.queue.findIndex((q) => q.key === call.key);
      if (waiting >= 0) {
        if (call.gift) this.queue[waiting] = call;
        continue;
      }
      if (call.gift) this.queue.unshift(call);
      else this.queue.push(call);
    }
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    for (const key of [...this.members.keys()]) this.removeMember(key);
    this.dj.dispose();
    this.renderer.dispose();
  }

  // --- crowd ----------------------------------------------------------------------
  private spotPosition(spot: number) {
    const s = SPOTS[spot % SPOTS.length];
    return new THREE.Vector3(s.x, 0, s.z);
  }

  private addMember(clubber: Clubber) {
    const dancer = this.makeAnimal(clubber.skin);
    dancer.energy = this.party ? 1.4 : 1;
    const target = this.spotPosition(clubber.spot);
    dancer.root.position.set(ENTRY.x + (Math.random() - 0.5), 0, ENTRY.z);
    dancer.facing = 0;
    this.scene.add(dancer.root);
    dancer.walkTo([new THREE.Vector3(target.x * 0.3, 0, Math.min(ENTRY.z - 1, target.z + 1.2)), target]);
    const tag = makeTag(clubber.name, clubber.avatar, false);
    tag.style.display = 'none';
    if (!clubber.bot) this.tagLayer.appendChild(tag); // bots are not real viewers: no name over their head
    this.members.set(clubber.key, { dancer, skin: clubber.skin, clubber, tag, performing: false, removeAfterShow: false, leaving: false, nextWanderAt: performance.now() + nextWanderDelay() });
  }

  private makeAnimal(skin: SkinId): Actor {
    return new AnimalActor(this.assets.skins.get(skin)!);
  }

  // The viewer typed an animal word: their body is swapped for that animal, keeping place, pose and any walk
  private changeSkin(m: Member, skin: SkinId) {
    const old = m.dancer;
    const next = this.makeAnimal(skin);
    next.root.position.copy(old.root.position);
    next.root.rotation.copy(old.root.rotation);
    next.baseY = old.baseY;
    next.facing = old.facing;
    next.energy = old.energy;
    next.onStage = old.onStage;
    const walk = old.pendingWalk();
    this.scene.remove(old.root);
    old.dispose();
    this.scene.add(next.root);
    if (walk) next.walkTo(walk.path, walk.onArrive);
    m.dancer = next;
    m.skin = skin;
    this.world.burstConfetti(40);
  }

  // Walks to the door, then disappears
  private sendOut(m: Member) {
    m.leaving = true;
    m.dancer.walkTo([new THREE.Vector3(m.dancer.root.position.x * 0.4, 0, ENTRY.z - 1), new THREE.Vector3(ENTRY.x, 0, ENTRY.z + 1.5)], () => this.removeMember(m.clubber.key));
  }

  private removeMember(key: string) {
    const m = this.members.get(key);
    if (!m) return;
    m.tag.remove();
    this.scene.remove(m.dancer.root);
    m.dancer.dispose();
    this.members.delete(key);
  }

  // --- stage shows ----------------------------------------------------------------
  private startShows() {
    while (this.queue.length && this.shows.length < STAGE_SLOTS.length) {
      const call = this.queue.shift()!;
      const member = this.members.get(call.key);
      if (!member || member.clubber.bot) continue; // not on the floor (yet): skip rather than conjure someone
      const taken = new Set(this.shows.map((s) => s.slot));
      const slot = STAGE_SLOTS.findIndex((_, i) => !taken.has(i));
      const show: Show = { call, member, slot, until: Infinity, onStage: false };
      this.shows.push(show);
      member.performing = true;
      this.swapTag(member, call);
      const x = STAGE_SLOTS[slot];
      const from = member.dancer.root.position;
      member.dancer.walkTo(
        [
          new THREE.Vector3(0, 0, Math.max(from.z, STAGE.front + 0.9)),
          new THREE.Vector3(0, 0, STAGE.front + 0.55),
          new THREE.Vector3(0, STAGE_Y, STAGE.front - 0.15),
          new THREE.Vector3(x, STAGE_Y, SLOT_Z),
        ],
        () => {
          show.onStage = true;
          member.dancer.onStage = true;
          show.until = performance.now() + (call.gift ? SHOW_MS.gift : SHOW_MS.keyword);
          member.dancer.baseY = STAGE_Y;
          member.dancer.facing = 0;
          member.dancer.style = call.gift ? 'handsUp' : 'pump';
          member.dancer.energy = 1.5;
          if (call.gift) this.celebrate(call.gift.tier);
        }
      );
    }
  }

  private swapTag(member: Member, call: StageCall | null) {
    member.tag.remove();
    member.tag = makeTag(member.clubber.name, member.clubber.avatar, Boolean(call));
    if (call?.gift) {
      const gift = document.createElement('em');
      gift.textContent = `🎁 ${call.gift.name}`;
      member.tag.appendChild(gift);
    }
    this.tagLayer.appendChild(member.tag);
  }

  private celebrate(tier: GiftTier) {
    this.world.burstConfetti(CONFETTI_BY_TIER[tier]);
    if (tier === 'huge' || tier === 'big') this.world.strobe();
  }

  private updateShows(now: number) {
    for (const show of [...this.shows]) {
      if (!show.onStage || now < show.until) continue;
      show.onStage = false;
      show.until = Infinity;
      const m = show.member;
      m.dancer.onStage = false;
      const x = STAGE_SLOTS[show.slot];
      const home = this.spotPosition(m.clubber.spot);
      m.dancer.walkTo(
        [
          new THREE.Vector3(x * 0.4, STAGE_Y, STAGE.front - 0.15),
          new THREE.Vector3(0, 0, STAGE.front + 0.55),
          new THREE.Vector3(0, 0, Math.max(home.z, STAGE.front + 0.9)),
          home,
        ],
        () => {
          m.performing = false;
          m.dancer.onStage = false;
          m.dancer.baseY = 0;
          m.dancer.energy = this.party ? 1.4 : 1;
          this.shows = this.shows.filter((s) => s !== show);
          if (this.focus === show) this.focus = null;
          if (m.removeAfterShow) this.removeMember(m.clubber.key);
          else this.swapTag(m, null);
        }
      );
      // the stage frees up as soon as they step down
      setTimeout(() => (this.shows = this.shows.filter((s) => s !== show)), 1500);
      if (this.focus === show) this.focus = null;
    }
    // Close-up: a gift giver standing on the stage first, otherwise anyone up there (heart or keyword)
    if (!this.focus || (!this.focus.call.gift && this.shows.some((s) => s.onStage && s.call.gift))) {
      this.focus = this.shows.find((s) => s.onStage && s.call.gift) ?? this.shows.find((s) => s.onStage) ?? null;
    }
    this.world.spotOn(this.focus ? STAGE_SLOTS[this.focus.slot] : this.shows.some((s) => s.onStage) ? 0 : null);
  }

  // --- frame ----------------------------------------------------------------------
  private loop = () => {
    this.frame = requestAnimationFrame(this.loop);
    if (this.frames++ % 30 === 0) this.resize();
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const time = this.clock.elapsedTime;
    const beat = this.beats.beat();
    this.startShows();
    this.updateShows(performance.now());
    this.wanderCrowd(performance.now());
    for (const m of this.members.values()) m.dancer.update(dt, beat);
    this.dj.update(dt, beat);
    this.world.update(dt, beat, this.party, time);
    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
    this.placeTags();
  };

  // Now and then a crowd member drifts to a nearby point and dances on there
  private wanderCrowd(now: number) {
    for (const m of this.members.values()) {
      if (now < m.nextWanderAt || m.performing || m.leaving || m.dancer.isWalking) continue;
      m.nextWanderAt = now + nextWanderDelay();
      const others = [...this.members.values()].filter((o) => o !== m).map((o) => o.dancer.root.position);
      const home = this.spotPosition(m.clubber.spot);
      const target = pickWanderTarget(home, m.dancer.root.position, others);
      if (target) m.dancer.walkTo([new THREE.Vector3(target.x, 0, target.z)]);
    }
  }

  private updateCamera(dt: number) {
    const focus = this.focus ? { key: this.focus.call.key, position: this.focus.member.dancer.root.position } : null;
    const { pos, look, fov } = this.director.pose(performance.now(), focus);
    const k = Math.min(1, dt * 2);
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov += (fov - this.camera.fov) * k;
      this.camera.updateProjectionMatrix();
    }
  }

  private placeTags() {
    const p = this.tmp;
    for (const m of this.members.values()) {
      if (m.clubber.bot) continue;
      m.dancer.headPosition(p);
      p.y += 0.32;
      p.project(this.camera);
      const visible = p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1 && !(m.dancer.isWalking && !m.performing && m.dancer.root.position.z > 3);
      m.tag.style.display = visible ? '' : 'none';
      if (!visible) continue;
      m.tag.style.left = `${((p.x + 1) / 2) * 100}%`;
      m.tag.style.top = `${((1 - p.y) / 2) * 100}%`;
      m.tag.style.zIndex = String(Math.round((1 - p.z) * 10000) + (m.performing ? 100000 : 0));
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
