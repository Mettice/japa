import * as THREE from 'three';
import {
  GateLabels,
  LANE_X,
  PlayerRig,
  disposeModelCaches,
  makeBanner,
  makeBarrier,
  makeBubble,
  makeCash,
  makeDanfo,
  makeGate,
  makeJollof,
  makePapers,
  makePhoneOff,
  makePlayer,
  release,
} from './models';
import { SEG, Scenery, SegmentHandle } from './scenery';
import { disposeStyle, outlineMaterial, setOutlineResolution, toon } from './style';

// Track distance d grows forward; world z = -d. Lanes are -1, 0, 1.

export type PickupKind = 'cash' | 'papers' | 'jollof' | 'phoneoff';
export type HitKind = 'barrier' | 'banner' | 'danfo' | 'bubble' | 'pillar';
export type Side = 'left' | 'right';

export interface ZoneDressing {
  signs: string[];
  banners: string[];
  bubbles: string[];
  stalls: boolean; // market umbrellas on the sidewalks
}

export interface WorldCallbacks {
  rng: () => number;
  zone: () => ZoneDressing; // dressing for newly spawned scenery
  nextGate: () => GateLabels | null; // labels for the next gate (null = no gate)
  onPickup: (kind: PickupKind) => void;
  onHit: (kind: HitKind) => void;
  onGateApproach: (approaching: boolean) => void;
  onGate: (side: Side, froze: boolean) => void;
  onLane: (lane: -1 | 0 | 1) => void;
  onDistance: (meters: number) => void;
}

const VIEW_AHEAD = 120;
const BEHIND = 14;
const START_SPEED = 12; // m/s
const MAX_SPEED = 22;
const ACCEL = 0.15; // m/s per second
const GATE_FIRST = 120;
const GATE_EVERY = 170; // ~15–20 s between decisions
const APPROACH = 80; // distance at which the decision UI appears
const SLOWMO_START = 55;
const SLOWMO_FULL = 28;
const SLOWMO_SCALE = 0.5;
const GATE_CLEAR_BEFORE = 32; // no obstacles this close before a gate…
const GATE_CLEAR_AFTER = 14; // …or just after it
const GRAVITY = 32;
const JUMP_V = 10.5;
const SLIDE_TIME = 0.75;
const INVULN = 1.2;
const MAX_STEP = 1 / 60; // small steps so fast movers can't skip through obstacles
const MAX_CATCH_UP = 0.25;

// Golden hour: warm low sun, sky fading from blue to apricot at the horizon
const SKY_TOP = '#5FA8D9';
const SKY_HORIZON = '#FFC58A';
const SUN_COLOR = '#FFB45E';
const FOG_NEAR = 35;

// Quality tiers. We start from a guess about the device, then step down automatically if
// the frame rate stays under 30 fps (and never back up mid-run, to avoid flicker).
type Quality = 0 | 1 | 2; // 0 = low, 1 = medium, 2 = high
const QUALITY = [
  { dpr: 1, shadows: false, shadowMap: 0 },
  { dpr: 1.5, shadows: true, shadowMap: 512 },
  { dpr: 2, shadows: true, shadowMap: 1024 },
] as const;
const MIN_FPS = 30;
const FPS_WINDOW = 2; // seconds per measurement window

const guessQuality = (): Quality => {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency || 4;
  const memory = nav.deviceMemory || 4;
  const touch = matchMedia('(pointer: coarse)').matches;
  if (!touch && cores >= 8) return 2;
  if (cores <= 4 || memory <= 3) return 0;
  return 1;
};

const SPEED_LINES = 28;
const COINS = 48;

interface Thing {
  kind: 'pickup' | 'obstacle' | 'bubble';
  type: PickupKind | HitKind;
  lane: number;
  d: number;
  halfLen: number;
  obj: THREE.Object3D;
  done: boolean;
  t: number;
}

interface Gate {
  d: number;
  group: THREE.Group;
  leftDoor: THREE.Mesh;
  rightDoor: THREE.Mesh;
  passed: boolean;
  burst: { door: THREE.Mesh; t: number } | null;
}

const laneX = (lane: number) => lane * LANE_X;

const skyTexture = () => {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, SKY_TOP);
  g.addColorStop(0.55, '#F7D9A8');
  g.addColorStop(1, SKY_HORIZON);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

interface Coin {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  life: number;
}

export class JapaRunWorld {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(62, 1, 0.1, 160);
  private player: PlayerRig;
  private scenery: Scenery;
  private segments = new Map<number, SegmentHandle>();
  private sun: THREE.DirectionalLight;
  private sky: THREE.Texture;
  private quality: Quality = guessQuality();
  private fpsFrames = 0;
  private fpsTime = 0;
  private slowWindows = 0;
  // Juice
  private speedLines: THREE.InstancedMesh;
  private speedLineState: { x: number; y: number; z: number }[] = [];
  private speedLineMat: THREE.MeshBasicMaterial;
  private coins: THREE.InstancedMesh;
  private coinOutline: THREE.InstancedMesh;
  private coinState: Coin[] = [];
  private fovKick = 0;
  private things: Thing[] = [];
  private gate: Gate | null = null;
  private nextGateAt = GATE_FIRST;
  private nextSpawnAt = 40;

  private dist = 0;
  private speed = START_SPEED;
  private lane: -1 | 0 | 1 = 0;
  private x = 0;
  private y = 0;
  private vy = 0;
  private sliding = 0;
  private invuln = 0;
  private shake = 0;
  private runPhase = 0;
  private timeScale = 1;
  private approaching = false;
  private lastDistanceReport = -1;

  private running = false;
  private raf = 0;
  private last = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver;
  // Camera framing per screen shape (portrait phone vs landscape desktop)
  private camFollow = 0.55; // how much the camera tracks the runner's lane
  private camHeight = 3.3;
  private camBack = 6.2;
  private baseFov = 70;

  constructor(private canvas: HTMLCanvasElement, private cb: WorldCallbacks) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: (window.devicePixelRatio || 1) < 2, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Golden hour: gradient sky, fog in the horizon colour so the street melts into it
    this.sky = skyTexture();
    this.scene.background = this.sky;
    this.scene.fog = new THREE.Fog(SKY_HORIZON, FOG_NEAR, VIEW_AHEAD - 5);
    this.scene.add(new THREE.HemisphereLight('#FFE6C7', '#6E4A35', 1.15));
    // Low warm sun from ahead-left: long shadows across the road
    this.sun = new THREE.DirectionalLight(SUN_COLOR, 2.4);
    const sc = this.sun.shadow.camera;
    sc.left = -16;
    sc.right = 16;
    sc.top = 24;
    sc.bottom = -24;
    sc.near = 1;
    sc.far = 70;
    this.sun.shadow.bias = -0.0015;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);

    this.scenery = new Scenery(this.scene);

    // Speed lines: thin streaks around the camera, one draw call
    this.speedLineMat = new THREE.MeshBasicMaterial({ color: '#FFF6E3', transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.speedLines = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.03, 2.2), this.speedLineMat, SPEED_LINES);
    this.speedLines.frustumCulled = false;
    for (let i = 0; i < SPEED_LINES; i++) this.speedLineState.push(this.randomStreak(true));
    this.scene.add(this.speedLines);

    // Coin pops: pooled gold discs with outlines
    const coinGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.06, 12).rotateX(Math.PI / 2);
    this.coins = new THREE.InstancedMesh(coinGeo, toon({ color: '#FFC93C' }), COINS);
    this.coinOutline = new THREE.InstancedMesh(coinGeo, outlineMaterial(), COINS);
    this.coinOutline.instanceMatrix = this.coins.instanceMatrix;
    for (const m of [this.coins, this.coinOutline]) {
      m.frustumCulled = false;
      m.count = 0;
      this.scene.add(m);
    }

    this.player = makePlayer();
    this.scene.add(this.player.group);
    this.applyQuality();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.streamScenery();
    this.render();
    // Idle render loop (player bobbing) until start()
    this.loop();
    document.addEventListener('visibilitychange', this.onVisibility);
    // Dev-only handle for perf checks: __world.stats()
    if (import.meta.env.DEV) (window as unknown as { __world: JapaRunWorld }).__world = this;
  }

  // Draw calls, triangles and frame time; used by dev perf checks
  stats() {
    const { calls, triangles } = this.renderer.info.render;
    return { calls, triangles, geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures, objects: this.scene.children.length, quality: this.quality };
  }

  // ---------- public controls ----------

  start() {
    this.running = true;
    this.last = performance.now();
  }

  setPaused(paused: boolean) {
    this.running = !paused;
    this.last = performance.now();
  }

  moveLeft() {
    if (!this.running) return;
    if (this.lane > -1) this.setLane((this.lane - 1) as -1 | 0);
  }

  moveRight() {
    if (!this.running) return;
    if (this.lane < 1) this.setLane((this.lane + 1) as 0 | 1);
  }

  jump() {
    if (!this.running || this.y > 0.01) return;
    this.vy = JUMP_V;
    this.sliding = 0;
  }

  slide() {
    if (!this.running) return;
    if (this.y > 0.01) this.vy = -JUMP_V * 1.3; // slam down mid-air
    this.sliding = SLIDE_TIME;
  }

  get meters() {
    return Math.floor(this.dist);
  }

  // Delivery done: shower of coins around the runner + a little FOV punch
  celebrate() {
    this.burstCoins(30, 7);
    this.fovKick = 1;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    for (const h of this.segments.values()) this.scenery.removeSegment(h);
    this.scenery.dispose();
    release(this.scene);
    disposeModelCaches();
    disposeStyle();
    this.sky.dispose();
    this.speedLines.geometry.dispose();
    this.speedLineMat.dispose();
    this.coins.geometry.dispose();
    (this.coins.material as THREE.Material).dispose();
    this.renderer.dispose();
  }

  // ---------- internals ----------

  private onVisibility = () => {
    // Hidden tab = paused; restart the clock on return instead of jumping ahead
    if (document.visibilityState === 'visible') this.last = performance.now();
  };

  private setLane(lane: -1 | 0 | 1) {
    this.lane = lane;
    this.cb.onLane(lane);
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.renderer.setSize(rect.width, rect.height, false);
    const aspect = rect.width / rect.height;
    this.camera.aspect = aspect;
    // Street-level camera: lower than before, so the buildings tower a bit more
    if (aspect < 0.6) {
      // Tall phone: widen the view so all three lanes stay visible
      this.baseFov = 70;
      this.camFollow = 0.55;
      this.camHeight = 3.3;
      this.camBack = 6.2;
    } else if (aspect < 1.3) {
      // Tablet / square-ish
      this.baseFov = 62;
      this.camFollow = 0.45;
      this.camHeight = 3.1;
      this.camBack = 6.8;
    } else {
      // Landscape desktop: lanes are all in view already, so a calmer, more cinematic camera
      this.baseFov = 52;
      this.camFollow = 0.3;
      this.camHeight = 2.9;
      this.camBack = 7.8;
    }
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.updateOutlineResolution();
  }

  private applyQuality() {
    const q = QUALITY[this.quality];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dpr));
    this.renderer.shadowMap.enabled = q.shadows;
    this.sun.castShadow = q.shadows;
    if (q.shadows) {
      this.sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    // Real shadows replace the runner's blob shadow
    const blob = this.player.group.getObjectByName('shadow');
    if (blob) blob.visible = !q.shadows;
    // Materials compile differently with/without shadow maps
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true));
      else if (m) m.needsUpdate = true;
    });
    this.updateOutlineResolution();
  }

  private updateOutlineResolution() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    setOutlineResolution(size.x, size.y, this.renderer.getPixelRatio());
  }

  // Step quality down if two windows in a row ran under MIN_FPS
  private trackFps(realDt: number) {
    if (!this.running) return;
    this.fpsFrames++;
    this.fpsTime += realDt;
    if (this.fpsTime < FPS_WINDOW) return;
    const fps = this.fpsFrames / this.fpsTime;
    this.fpsFrames = 0;
    this.fpsTime = 0;
    this.slowWindows = fps < MIN_FPS ? this.slowWindows + 1 : 0;
    if (this.slowWindows >= 2 && this.quality > 0) {
      this.quality = (this.quality - 1) as Quality;
      this.slowWindows = 0;
      this.applyQuality();
      this.resize();
      if (import.meta.env.DEV) console.info(`[runner] ${fps.toFixed(0)} fps: quality -> ${this.quality}`);
    }
  }

  private loop = () => {
    if (this.disposed) return;
    const now = performance.now();
    const frameDt = (now - this.last) / 1000;
    let remaining = Math.min(MAX_CATCH_UP, frameDt);
    this.last = now;
    if (document.visibilityState === 'visible' && frameDt < 1) this.trackFps(frameDt);
    if (this.running) {
      while (remaining > 0) {
        const dt = Math.min(MAX_STEP, remaining);
        this.update(dt);
        remaining -= dt;
      }
    } else {
      this.animatePlayer(1 / 60, false);
    }
    this.render();
    this.raf = requestAnimationFrame(this.loop);
  };

  private update(realDt: number) {
    // Slow motion while a decision gate is close
    const toGate = this.gate && !this.gate.passed ? this.gate.d - this.dist : Infinity;
    let targetScale = 1;
    if (toGate < SLOWMO_START) {
      const k = Math.min(1, (SLOWMO_START - toGate) / (SLOWMO_START - SLOWMO_FULL));
      targetScale = 1 - k * (1 - SLOWMO_SCALE);
    }
    this.timeScale += (targetScale - this.timeScale) * Math.min(1, realDt * 6);
    const dt = realDt * this.timeScale;

    const approaching = toGate < APPROACH;
    if (approaching !== this.approaching) {
      this.approaching = approaching;
      this.cb.onGateApproach(approaching);
    }

    // Movement
    this.speed = Math.min(MAX_SPEED, this.speed + ACCEL * realDt);
    this.dist += this.speed * dt;
    this.x += (laneX(this.lane) - this.x) * Math.min(1, dt * 14);
    this.vy -= GRAVITY * dt;
    this.y = Math.max(0, this.y + this.vy * dt);
    if (this.y === 0) this.vy = 0;
    this.sliding = Math.max(0, this.sliding - dt);
    this.invuln = Math.max(0, this.invuln - realDt);
    this.shake = Math.max(0, this.shake - realDt);

    this.spawn();
    this.updateThings(dt);
    this.updateGate(dt);
    this.streamScenery();
    this.animatePlayer(dt, true);
    this.updateJuice(dt, realDt);

    const m = Math.floor(this.dist);
    if (m !== this.lastDistanceReport && m % 5 === 0) {
      this.lastDistanceReport = m;
      this.cb.onDistance(m);
    }
  }

  // ---------- scenery ----------

  private streamScenery() {
    const first = Math.floor((this.dist - BEHIND) / SEG);
    const lastSeg = Math.floor((this.dist + VIEW_AHEAD) / SEG);
    for (let i = first; i <= lastSeg; i++) {
      if (!this.segments.has(i)) this.segments.set(i, this.scenery.buildSegment(i, this.cb.zone(), this.cb.rng));
    }
    for (const [i, h] of this.segments) {
      if (i < first) {
        this.scenery.removeSegment(h);
        this.segments.delete(i);
      }
    }
  }

  // ---------- obstacles & pickups ----------

  private spawn() {
    const rng = this.cb.rng;
    // Gate first, so obstacle spawning can keep clear of it
    if (!this.gate && this.nextGateAt - this.dist < VIEW_AHEAD) {
      const labels = this.cb.nextGate();
      if (labels) {
        const { group, leftDoor, rightDoor } = makeGate(labels);
        group.position.z = -this.nextGateAt;
        this.scene.add(group);
        this.gate = { d: this.nextGateAt, group, leftDoor, rightDoor, passed: false, burst: null };
      } else {
        this.nextGateAt += GATE_EVERY;
      }
    }

    while (this.nextSpawnAt - this.dist < VIEW_AHEAD) {
      const d = this.nextSpawnAt;
      const progress = Math.min(1, this.dist / 1500);
      this.nextSpawnAt += 14 - 4 * progress + rng() * 5;
      const gateD = this.gate ? this.gate.d : this.nextGateAt;
      if (d > gateD - GATE_CLEAR_BEFORE && d < gateD + GATE_CLEAR_AFTER) continue;

      const roll = rng();
      const lanes = [-1, 0, 1].sort(() => rng() - 0.5);
      if (roll < 0.3) {
        // Cash line
        const lane = lanes[0];
        for (let i = 0; i < 5; i++) this.add('pickup', 'cash', lane, d + i * 2.2, 0.5, makeCash(), 0.7);
      } else if (roll < 0.45) {
        // Barrier(s): always leave a lane free
        const n = rng() < 0.4 + progress * 0.3 ? 2 : 1;
        for (let i = 0; i < n; i++) this.add('obstacle', 'barrier', lanes[i], d, 0.25, makeBarrier());
        if (rng() < 0.5) this.add('pickup', 'papers', lanes[2], d, 0.5, makePapers(), 0.8);
      } else if (roll < 0.57) {
        const zone = this.cb.zone();
        this.add('obstacle', 'banner', lanes[0], d, 0.2, makeBanner(zone.banners[Math.floor(rng() * zone.banners.length)]));
        if (rng() < 0.4 + progress * 0.3) this.add('obstacle', 'barrier', lanes[1], d, 0.25, makeBarrier());
      } else if (roll < 0.72) {
        const n = rng() < 0.35 + progress * 0.25 ? 2 : 1;
        for (let i = 0; i < n; i++) this.add('obstacle', 'danfo', lanes[i], d + 2, 2.1, makeDanfo());
        if (rng() < 0.6) this.add('pickup', 'jollof', lanes[2], d, 0.5, makeJollof(), 0.7);
      } else if (roll < 0.86) {
        const zone = this.cb.zone();
        this.add('bubble', 'bubble', lanes[0], d + 25, 0.4, makeBubble(zone.bubbles[Math.floor(rng() * zone.bubbles.length)]), 1.45);
      } else if (roll < 0.95) {
        this.add('pickup', 'papers', lanes[0], d, 0.5, makePapers(), 0.8);
        this.add('pickup', 'jollof', lanes[1], d + 3, 0.5, makeJollof(), 0.7);
      } else {
        this.add('pickup', 'phoneoff', lanes[0], d, 0.5, makePhoneOff(), 0.9);
      }
    }
  }

  private add(kind: Thing['kind'], type: Thing['type'], lane: number, d: number, halfLen: number, obj: THREE.Object3D, y = 0) {
    obj.position.set(laneX(lane), y, -d);
    this.scene.add(obj);
    this.things.push({ kind, type, lane, d, halfLen, obj, done: false, t: 0 });
  }

  private updateThings(dt: number) {
    const px = this.x;
    for (const t of this.things) {
      t.t += dt;
      if (t.kind === 'pickup' && !t.done) {
        t.obj.rotation.y += dt * 3;
        t.obj.position.y += Math.sin(t.t * 4) * 0.004;
      }
      if (t.kind === 'bubble' && !t.done) {
        t.d -= 6 * dt; // flies at you
        t.obj.position.z = -t.d;
        t.obj.position.y = 1.45 + Math.sin(t.t * 5) * 0.12;
      }
      if (t.done) {
        // Collected pickups pop up and shrink; hit obstacles tip over
        if (t.kind === 'pickup' || t.kind === 'bubble') {
          t.obj.position.y += dt * 4;
          t.obj.scale.multiplyScalar(Math.max(0, 1 - dt * 5));
        } else if (t.type === 'barrier' || t.type === 'banner') {
          t.obj.rotation.x = Math.max(-Math.PI / 2, t.obj.rotation.x - dt * 8);
        }
        continue;
      }

      const dz = Math.abs(t.d - this.dist);
      if (dz > t.halfLen + 0.35 || Math.abs(laneX(t.lane) - px) > 1.0) continue;

      if (t.kind === 'pickup') {
        t.done = true;
        if (t.type === 'cash') this.burstCoins(3, 3.5);
        this.cb.onPickup(t.type as PickupKind);
        continue;
      }
      // Obstacles: barriers can be jumped, banners slid under, bubbles ducked
      const cleared =
        (t.type === 'barrier' && this.y > 0.75) ||
        ((t.type === 'banner' || t.type === 'bubble') && this.sliding > 0);
      if (cleared || this.invuln > 0) continue;
      t.done = true;
      this.hit(t.type as HitKind);
    }

    // Recycle anything behind the camera
    const keep: Thing[] = [];
    for (const t of this.things) {
      if (t.d < this.dist - BEHIND) {
        this.scene.remove(t.obj);
        release(t.obj);
      } else keep.push(t);
    }
    this.things = keep;
  }

  private hit(kind: HitKind) {
    this.invuln = INVULN;
    this.shake = 0.28; // small and quick: felt more than seen
    this.speed = Math.max(START_SPEED * 0.7, this.speed * 0.6);
    this.cb.onHit(kind);
  }

  private updateGate(dt: number) {
    const gate = this.gate;
    if (!gate) return;
    if (!gate.passed && this.dist >= gate.d) {
      gate.passed = true;
      let side: Side;
      let froze = false;
      if (this.x < -LANE_X / 2) side = 'left';
      else if (this.x > LANE_X / 2) side = 'right';
      else {
        // Centre lane = straight into the pillar: Mama chooses for you
        froze = true;
        side = this.cb.rng() < 0.5 ? 'left' : 'right';
        this.hit('pillar');
      }
      gate.burst = { door: side === 'left' ? gate.leftDoor : gate.rightDoor, t: 0 };
      this.cb.onGate(side, froze);
      this.nextGateAt = gate.d + GATE_EVERY;
    }
    if (gate.burst) {
      gate.burst.t += dt;
      const door = gate.burst.door;
      door.rotation.x = -gate.burst.t * 6;
      door.position.y = 1.55 + gate.burst.t * 3;
      (door.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - gate.burst.t * 2);
    }
    if (gate.passed && this.dist > gate.d + BEHIND) {
      this.scene.remove(gate.group);
      release(gate.group);
      this.gate = null;
    }
  }

  // ---------- juice ----------

  private randomStreak(anywhere = false) {
    // Ring around the camera's forward axis, kept clear of the centre of the screen
    const angle = Math.random() * Math.PI * 2;
    const radius = 2.2 + Math.random() * 2.5;
    return {
      x: Math.cos(angle) * radius,
      y: 1.6 + Math.sin(angle) * radius * 0.7,
      z: -(anywhere ? Math.random() * 30 : 30), // ahead of the camera (relative)
    };
  }

  private updateJuice(dt: number, realDt: number) {
    // Speed lines fade in above cruising speed and vanish in slow-mo
    const intensity = Math.max(0, Math.min(1, (this.speed - 14) / 7)) * Math.max(0, (this.timeScale - 0.6) / 0.4);
    this.speedLineMat.opacity = intensity * 0.55;
    this.speedLines.visible = intensity > 0.02;
    if (this.speedLines.visible) {
      const m = new THREE.Matrix4();
      const camZ = -this.dist + this.camBack;
      this.speedLineState.forEach((s, i) => {
        s.z += this.speed * 2.2 * dt;
        if (s.z > 2) Object.assign(s, this.randomStreak());
        m.makeTranslation(s.x, s.y, camZ + s.z);
        this.speedLines.setMatrixAt(i, m);
      });
      this.speedLines.instanceMatrix.needsUpdate = true;
    }

    // Coins: arc up, spin, fall, shrink away
    if (this.coinState.length) {
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const e = new THREE.Euler();
      this.coinState = this.coinState.filter((c) => (c.life -= realDt) > 0);
      this.coinState.forEach((c, i) => {
        c.vy -= 18 * realDt;
        c.x += c.vx * realDt;
        c.y = Math.max(0.1, c.y + c.vy * realDt);
        c.z += c.vz * realDt;
        c.spin += realDt * 14;
        const sc = Math.min(1, c.life * 2.5);
        m.compose(new THREE.Vector3(c.x, c.y, c.z), q.setFromEuler(e.set(0, c.spin, 0)), new THREE.Vector3(sc, sc, sc));
        this.coins.setMatrixAt(i, m);
      });
      this.coins.count = this.coinOutline.count = this.coinState.length;
      this.coins.instanceMatrix.needsUpdate = true;
    } else {
      this.coins.count = this.coinOutline.count = 0;
    }

    this.fovKick = Math.max(0, this.fovKick - realDt * 1.6);
  }

  private burstCoins(n: number, power: number) {
    for (let i = 0; i < n && this.coinState.length < COINS; i++) {
      const a = Math.random() * Math.PI * 2;
      const rad = Math.random() * power * 0.35;
      this.coinState.push({
        x: this.x,
        y: this.y + 1.2,
        z: -this.dist - 0.5,
        vx: Math.cos(a) * rad,
        vy: power * (0.8 + Math.random() * 0.6),
        vz: Math.sin(a) * rad - this.speed * 0.15,
        spin: Math.random() * 6,
        life: 0.9 + Math.random() * 0.5,
      });
    }
  }

  // ---------- player & camera ----------

  private animatePlayer(dt: number, moving: boolean) {
    const p = this.player;
    this.runPhase += dt * (moving ? 6 + this.speed * 0.6 : 2);
    const swing = moving && this.y === 0 && this.sliding === 0 ? Math.sin(this.runPhase) * 0.9 : moving ? 0.5 : Math.sin(this.runPhase) * 0.08;
    p.legL.rotation.x = swing;
    p.legR.rotation.x = -swing;
    p.armL.rotation.x = -swing * 0.8;
    p.armR.rotation.x = swing * 0.8;

    p.group.position.set(this.x, this.y, -this.dist);
    // Lean into lane changes
    p.body.rotation.z = (this.x - laneX(this.lane)) * 0.12;
    if (this.sliding > 0) {
      p.body.rotation.x = -1.1;
      p.body.position.y = -0.35;
    } else {
      p.body.rotation.x = moving ? -0.12 : 0;
      p.body.position.y = moving && this.y === 0 ? Math.abs(Math.sin(this.runPhase)) * 0.08 : 0;
    }
    // Blink while invulnerable
    p.body.visible = this.invuln <= 0 || Math.floor(this.invuln * 12) % 2 === 0;
    const shadow = p.group.getObjectByName('shadow');
    if (shadow) {
      shadow.position.y = 0.02 - this.y;
      shadow.scale.setScalar(Math.max(0.4, 1 - this.y * 0.25));
    }
  }

  private render() {
    const cam = this.camera;
    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.8 : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.8 : 0;
    cam.position.set(this.x * this.camFollow + sx, this.camHeight + this.y * 0.35 + sy, -this.dist + this.camBack);
    cam.lookAt(this.x * this.camFollow, 1.35, -this.dist - 10);
    // Celebration punch: brief FOV widen that eases back
    const fov = this.baseFov + Math.sin(this.fovKick * Math.PI) * 6;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    // Sun and its shadow box follow the runner (shadows only where you can see them)
    this.sun.position.set(this.x - 14, 9, -this.dist - 16);
    this.sun.target.position.set(this.x, 0, -this.dist - 18);
    this.renderer.render(this.scene, cam);
  }
}
