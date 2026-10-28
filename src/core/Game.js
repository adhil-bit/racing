import * as THREE from 'three';
import { RACE, MODES, vehiclesFor, AI_ROSTER, CAMERA, STORAGE_KEY } from '../config.js';
import { Track } from '../world/Track.js';
import { buildWorld } from '../world/index.js';
import { Vehicle, isWater } from '../vehicles/Vehicle.js';
import { Plane } from '../vehicles/Plane.js';
import { setVehicleEnvironment } from '../vehicles/models.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { AIRacer } from '../ai/AIRacer.js';
import { Particles } from '../fx/Particles.js';
import { Input } from './Input.js';
import { AudioEngine } from './AudioEngine.js';
import { HUD, gearFor, formatTime } from '../ui/HUD.js';
import { Minimap } from '../ui/Minimap.js';
import { Menu } from '../ui/Menu.js';

const $ = (id) => document.getElementById(id);
const CAM_F = new THREE.Vector3();
const LOOK = new THREE.Vector3();
const MID = new THREE.Vector3();
const TOUCH_LABELS = {
  road: { up: 'Gas', down: 'Brake', hand: 'Drift' },
  water: { up: 'Gas', down: 'Brake', hand: 'Slide' },
  air: { up: 'Climb', down: 'Dive', hand: 'Air brake' },
};
const ENGINE_PITCH = { car: 1, bike: 1.55, boat: 0.85, jetski: 1.3, prop: 0.8, jet: 1.9 };
const ORD = ['th', 'st', 'nd', 'rd'];
const ordinal = (n) => n + (ORD[(n % 100 - 20) % 10] || ORD[n % 100] || ORD[0]);

function loadSave() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
}

// States: menu -> countdown -> racing -> finished ; racing <-> paused
export class Game {
  constructor(root) {
    this.root = root;
    this.state = 'menu';
    this.saved = loadSave();
    this.camMode = 0;
    this.shake = 0;
    this.racers = [];
    this.ais = [];
    this.worlds = {};
    this.elapsed = 0;
  }

  init() {
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    r.setSize(window.innerWidth, window.innerHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.2;
    this.root.appendChild(r.domElement);

    this.camera = new THREE.PerspectiveCamera(CAMERA.baseFov, window.innerWidth / window.innerHeight, 0.1, 3000);
    const pmrem = new THREE.PMREMGenerator(r);
    setVehicleEnvironment(pmrem.fromScene(new RoomEnvironment(r), 0.04).texture);
    pmrem.dispose();
    this.input = new Input();
    this.audio = new AudioEngine();
    this.hud = new HUD();

    // per-mode garage choices (older saves only stored the road vehicle)
    const selections = this.saved.vehicles || (this.saved.vehicle ? { road: this.saved.vehicle } : {});
    const mode = MODES[this.saved.mode] ? this.saved.mode : 'road';
    this.loadMode(mode);
    this.menu = new Menu({
      mode,
      selections,
      onMode: (id, spec, color) => {
        this.selection = { spec, color };
        this.persist({ mode: id });
        this.loadMode(id);
        this.buildGrid();
      },
      onChange: (spec, color) => {
        this.selection = { spec, color };
        this.persist({ vehicles: { ...(this.saved.vehicles || selections), [this.modeId]: { id: spec.id, color } } });
        this.buildGrid();
      },
      onStart: () => this.startRace(),
    });
    this.selection = { spec: this.menu.spec, color: this.menu.color };
    this.setAutoGas(this.saved.autoGas !== false);
    $('auto-gas').addEventListener('change', (e) => {
      this.setAutoGas(e.target.checked);
      this.persist({ autoGas: e.target.checked });
    });
    this.buildGrid();
    this.bindControls();

    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'racing') this.setPaused(true);
    });
    if (window.matchMedia('(pointer: coarse)').matches) document.body.classList.add('is-touch');

    this.clock = new THREE.Clock();
    this.menuAngle = 0.6;
    this.camHeading = 0;
    r.setAnimationLoop(() => this.frame());
    document.body.classList.add('is-ready');
  }

  persist(patch) {
    Object.assign(this.saved, patch);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.saved)); } catch { /* storage unavailable */ }
  }

  // ---------------------------------------------------------------- setup
  // Each mode's world is built the first time it's opened, then cached.
  loadMode(id) {
    for (const x of this.racers) x.dispose(this.scene);
    this.racers = [];
    this.ais = [];
    this.modeId = id;
    this.mode = MODES[id];
    if (!this.worlds[id]) {
      const scene = new THREE.Scene();
      const track = new Track(this.mode.track);
      const world = buildWorld(id, scene, track);
      this.worlds[id] = { scene, track, world, particles: new Particles(scene), minimap: new Minimap($('minimap'), track) };
    }
    Object.assign(this, this.worlds[id]);
    this.minimap.rebind();
    this.camera.far = this.mode.cameraFar;
    this.camera.updateProjectionMatrix();
    this.input.flightMode = id === 'air';
    document.body.dataset.mode = id;
    for (const [control, label] of Object.entries(TOUCH_LABELS[id])) {
      const b = document.querySelector(`[data-control="${control}"]`);
      if (b) b.textContent = label;
    }
  }

  get bestLap() {
    const b = this.saved.best || {};
    return b[this.modeId] ?? (this.modeId === 'road' ? this.saved.bestLap : undefined);
  }

  set bestLap(t) {
    this.persist({ best: { ...(this.saved.best || {}), [this.modeId]: t } });
  }

  gridSlot(k) {
    const row = Math.floor(k / 2);
    const gap = Math.ceil(this.mode.gridSpacing / this.track.segLen);
    return { index: this.track.count - 6 - row * gap, lateral: (k % 2 ? 1 : -1) * this.track.width * 0.22 };
  }

  buildGrid() {
    for (const x of this.racers) x.dispose(this.scene);
    const { spec, color } = this.selection;
    const Kind = spec.kind === 'plane' ? Plane : Vehicle;
    this.player = new Kind(spec, color, this.track, this.scene);
    this.ais = [];
    const roster = vehiclesFor(this.modeId);
    const slots = [...Array(RACE.opponents + 1).keys()].filter((k) => k !== RACE.playerGridSlot);
    AI_ROSTER.slice(0, RACE.opponents).forEach((driver, k) => {
      const aiSpec = roster[(k + 1) % roster.length];
      const aiColor = aiSpec.colors[(k + 1) % aiSpec.colors.length];
      const ai = new AIRacer(aiSpec, aiColor, this.track, this.scene, { ...driver, cornerGrip: this.mode.aiCornerGrip, pace: this.mode.aiPace ?? 1 });
      const g = this.gridSlot(slots[k]);
      ai.placeOnGrid(g.index, g.lateral);
      this.ais.push(ai);
    });
    const g = this.gridSlot(RACE.playerGridSlot);
    this.player.placeOnGrid(g.index, g.lateral);
    this.racers = [this.player, ...this.ais];
    this.camHeading = this.player.heading;
    this.camY = this.player.pos.y;
  }

  bindControls() {
    const i = this.input;
    const togglePause = () => {
      if (this.state === 'racing') this.setPaused(true);
      else if (this.state === 'paused') this.setPaused(false);
    };
    i.on('Escape', togglePause);
    i.on('KeyP', togglePause);
    i.on('KeyC', () => { this.camMode = (this.camMode + 1) % 3; });
    i.on('KeyR', () => { if (this.state === 'racing' && !this.player.finished) this.player.recover(); });
    i.on('KeyM', () => this.toggleMute());
    i.on('Enter', () => {
      if (this.state === 'menu') this.startRace();
      else if (this.state === 'finished') this.startRace();
    });
    $('pause-btn').addEventListener('click', togglePause);
    $('cam-btn').addEventListener('click', () => { this.camMode = (this.camMode + 1) % 3; });
    $('mute-btn').addEventListener('click', () => this.toggleMute());
    $('resume-btn').addEventListener('click', () => this.setPaused(false));
    $('restart-btn').addEventListener('click', () => this.startRace());
    $('quit-btn').addEventListener('click', () => this.toGarage());
    $('again-btn').addEventListener('click', () => this.startRace());
    $('garage-btn').addEventListener('click', () => this.toGarage());
    this.syncMuteLabel();
  }

  setAutoGas(on) {
    this.input.autoThrottle = on;
    $('auto-gas').checked = on;
    $('auto-gas-hint').textContent = on ? 'Always on gas. Brake to slow down.' : 'Hold ↑ or W to accelerate.';
    document.body.classList.toggle('auto-gas', on);
  }

  toggleMute() {
    this.audio.setMuted(!this.audio.muted);
    this.syncMuteLabel();
  }

  syncMuteLabel() {
    const b = $('mute-btn');
    b.textContent = this.audio.muted ? 'Sound off' : 'Sound on';
    b.setAttribute('aria-pressed', String(!this.audio.muted));
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // ------------------------------------------------------------ transitions
  startRace() {
    this.audio.start();
    this.buildGrid();
    this.menu.show(false);
    $('pause').hidden = true;
    $('results').hidden = true;
    this.hud.show(true);
    this.state = 'countdown';
    this.countT = RACE.countdown + 0.8;
    this.shownCount = null;
    this.raceTime = 0;
    this.lapStart = 0;
    this.lastLapTime = 0;
    this.raceBest = Infinity;
    this.maxLap = this.player.lapCounter;
    this.finishOrder = [];
    this.resultsTimer = 0;
    this.particles.update(10);
  }

  setPaused(p) {
    if (p) {
      this.state = 'paused';
      this.audio.silence();
      $('pause').hidden = false;
      $('resume-btn').focus();
    } else {
      this.state = 'racing';
      $('pause').hidden = true;
      this.clock.getDelta();
    }
  }

  toGarage() {
    this.state = 'menu';
    $('pause').hidden = true;
    $('results').hidden = true;
    this.hud.show(false);
    this.hud.countdown('');
    this.audio.silence();
    this.buildGrid();
    this.menu.show(true);
  }

  // ------------------------------------------------------------ main loop
  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const ctl = this.input.poll();
    switch (this.state) {
      case 'menu': this.menuFrame(dt); break;
      case 'countdown': this.countdownFrame(dt, ctl); break;
      case 'racing':
      case 'finished': this.raceFrame(dt, ctl); break;
      default: break;
    }
    if (this.state !== 'paused') {
      this.particles.update(dt);
      this.elapsed += dt;
      this.world.update(this.elapsed);
    }
    this.world.sky.position.copy(this.camera.position);
    this.renderer.render(this.scene, this.camera);
  }

  menuFrame(dt) {
    this.menuAngle += dt * 0.3;
    const p = this.player;
    const rig = CAMERA.rigs[p.spec.kind];
    const d = rig.chase[0] * 1.15;
    const a = p.heading + this.menuAngle;
    this.camera.position.set(p.pos.x + Math.sin(a) * d, p.pos.y + rig.chase[1] * 0.8, p.pos.z + Math.cos(a) * d);
    // offset the subject toward the right so the menu panel doesn't cover it
    LOOK.set(Math.cos(a), 0, -Math.sin(a)).multiplyScalar(window.innerWidth > 820 ? -d * 0.25 : 0);
    this.camera.lookAt(p.pos.x + LOOK.x, p.pos.y + (p.spec.kind === 'plane' ? 0 : 0.75), p.pos.z + LOOK.z);
    this.camera.fov = CAMERA.baseFov;
    this.camera.updateProjectionMatrix();
    p.syncModel(dt);
  }

  countdownFrame(dt, ctl) {
    this.countT -= dt;
    const n = Math.ceil(this.countT);
    if (n !== this.shownCount && n <= RACE.countdown && n > 0) {
      this.shownCount = n;
      this.hud.countdown(String(n));
      this.audio.beep(false);
    }
    this.player.update(dt, ctl, false);
    for (const ai of this.ais) ai.update(dt, false, this.player.progress, this.player.lateral);
    if (this.countT <= 0) {
      if (this.mode.rollingStart) {
        const f = this.mode.rollingStart;
        if (this.player.launch) this.player.launch(this.player.spec.stats.top * f);
        for (const ai of this.ais) ai.speed = ai.spec.stats.top * f;
      }
      this.state = 'racing';
      this.hud.countdown('Go');
      this.audio.beep(true);
      setTimeout(() => this.hud.countdown(''), 900);
    }
    this.updateCamera(dt);
    this.updateAudio(ctl);
    this.updateHud(dt);
  }

  raceFrame(dt, ctl) {
    const p = this.player;
    const L = this.track.length;
    const finishLine = RACE.laps * L;
    this.raceTime += dt;

    // after the flag the player coasts on autopilot-ish controls
    const control = p.finished ? {
      throttle: 0.4, brake: 0, steer: this.autoSteer(), handbrake: false, nitro: false,
      pitch: THREE.MathUtils.clamp((this.track.points[p.trackIndex].y - p.pos.y) * 0.15, -1, 1),
    } : ctl;
    p.update(dt, control, true);
    for (const ai of this.ais) ai.update(dt, true, p.progress, p.lateral);
    this.resolveCollisions();

    // laps (first crossing of the line starts lap 1; timing runs from "Go")
    if (p.lapCounter > this.maxLap) {
      this.maxLap = p.lapCounter;
      if (p.lapCounter >= 1 && !p.finished) {
        const lt = this.raceTime - this.lapStart;
        this.lapStart = this.raceTime;
        this.lastLapTime = lt;
        const pb = this.bestLap || Infinity;
        this.raceBest = Math.min(this.raceBest, lt);
        if (lt < pb) {
          this.bestLap = lt;
          this.hud.flash(`New best lap ${formatTime(lt)}`, 2.4, 'good');
        } else if (p.lapCounter === RACE.laps - 1) this.hud.flash('Final lap', 2.2);
        else this.hud.flash(`Lap ${formatTime(lt)}`, 1.8);
      }
      if (p.lapCounter >= RACE.laps && !p.finished) {
        p.finished = true;
        p.finishTime = this.raceTime;
        this.finishOrder.push(p);
        const place = this.finishOrder.length;
        this.hud.flash(`${ordinal(place)} place`, 3, place === 1 ? 'good' : '');
        this.resultsTimer = 2.6;
      }
    }
    for (const ai of this.ais) {
      if (!ai.finished && ai.s >= finishLine) {
        ai.finished = true;
        ai.finishTime = this.raceTime;
        this.finishOrder.push(ai);
      }
    }
    if (this.resultsTimer > 0) {
      this.resultsTimer -= dt;
      if (this.resultsTimer <= 0) this.showResults();
    }

    // effects
    this.effects(p);
    if (p.nitroReadyEvent && !p.finished) {
      this.hud.flash('Nitro ready', 1.4, 'good');
      this.audio.chime();
    }
    if (p.wrongWay > 1.2 && !p.finished) this.hud.wrongWay(true);

    this.updateCamera(dt);
    this.updateAudio(control);
    if (this.state === 'racing') this.updateHud(dt);
  }

  effects(p) {
    const kind = p.spec.kind;
    const fx = this.particles;
    if (isWater(kind)) {
      const boat = kind === 'boat';
      if (Math.abs(p.vf) > 3) fx.wake(p.pos, p.heading, Math.abs(p.vf), boat ? 4.4 : 1.6, boat ? 0.85 : 0);
      for (const ai of this.ais) {
        if (ai.speed > 3 && ai.pos.distanceToSquared(p.pos) < 120 * 120 && Math.random() < 0.35) {
          fx.wake(ai.pos, ai.heading, ai.speed, ai.spec.kind === 'boat' ? 4.4 : 1.6, ai.spec.kind === 'boat' ? 0.85 : 0);
        }
      }
      if (p.drifting && Math.random() < 0.5) fx.splash(p.pos, 2, 0.8);
      if (p.impact > 3) {
        this.audio.impact(p.impact);
        this.shake = Math.min(1, this.shake + p.impact * 0.03);
        fx.splash(p.pos, Math.min(18, 4 + p.impact | 0), 1.2);
      } else if (p.scraping && Math.abs(p.vf) > 10 && Math.random() < 0.4) fx.splash(p.pos, 2, 0.7);
    } else if (kind === 'plane') {
      if (p.contrail) fx.contrail(p.pos, p.heading, 4.3, p.bank);
      if (p.scraping && !p.finished) this.hud.flash('Stay inside the gates', 0.5, 'warn');
    } else {
      if (p.drifting) fx.tyreSmoke(p.pos, p.heading, Math.min(1, Math.abs(p.vr) / 10), kind === 'car');
      if (p.impact > 3) {
        this.audio.impact(p.impact);
        this.shake = Math.min(1, this.shake + p.impact * 0.04);
        fx.sparkBurst(p.pos, p.vel.clone().normalize(), Math.min(14, 3 + p.impact | 0));
      } else if (p.scraping && Math.abs(p.vf) > 12 && Math.random() < 0.5) {
        fx.sparkBurst(p.pos, p.vel.clone().normalize(), 1);
      }
    }
  }

  // keep the coasting car pointed down the track after the finish
  autoSteer() {
    const p = this.player;
    const t = this.track.tangents[this.track.wrap(p.trackIndex + 8)];
    let diff = Math.atan2(t.x, t.z) - p.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    return THREE.MathUtils.clamp(-diff * 2 - p.lateral * 0.05, -1, 1);
  }

  resolveCollisions() {
    const p = this.player;
    const air = p.spec.kind === 'plane';
    for (const a of this.ais) {
      const dx = p.pos.x - a.pos.x;
      const dz = p.pos.z - a.pos.z;
      const dy = air ? p.pos.y - a.pos.y : 0;
      const d2 = dx * dx + dz * dz + dy * dy;
      const min = (p.radius + a.radius) * 0.85;
      if (d2 > min * min || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const nz = dz / d;
      const overlap = min - d;
      p.pos.x += nx * overlap * 0.6;
      p.pos.y += ny * overlap * 0.6;
      p.pos.z += nz * overlap * 0.6;
      const rel = (p.vel.x - a.vel.x) * nx + (p.vel.z - a.vel.z) * nz + (p.vel.y - a.vel.y) * ny;
      const alongN = nx * a.tangent.x + nz * a.tangent.z;
      const sideN = nx * a.right.x + nz * a.right.z;
      if (air) a.alt -= ny * overlap * 0.4;
      if (rel < 0) {
        if (air) p.speed = Math.max(40, p.speed + rel * 0.35);
        else {
          p.vel.x -= nx * rel * 0.75;
          p.vel.z -= nz * rel * 0.75;
        }
        a.nudge(-sideN * overlap * 0.5, -alongN * overlap * 0.3, -rel * 0.45 * -alongN);
        if (-rel > 2) {
          this.audio.impact(-rel);
          this.shake = Math.min(1, this.shake + -rel * 0.05);
          MID.set((p.pos.x + a.pos.x) / 2, (p.pos.y + a.pos.y) / 2, (p.pos.z + a.pos.z) / 2);
          if (isWater(p.spec.kind)) this.particles.splash(MID, 8, 1);
          else this.particles.sparkBurst(MID, new THREE.Vector3(nx, 0, nz), 6);
        }
      } else {
        a.nudge(-sideN * overlap * 0.4, 0, 0);
      }
    }
    // AI vs AI: keep them from overlapping by spreading lanes
    const gap = air ? 9 : 4.5;
    const laneGap = air ? 7 : this.modeId === 'water' ? 4 : 2.6;
    for (let i = 0; i < this.ais.length; i++) {
      for (let j = i + 1; j < this.ais.length; j++) {
        const a = this.ais[i];
        const b = this.ais[j];
        if (Math.abs(a.s - b.s) > gap) continue;
        if (air && Math.abs(a.alt - b.alt) > 6) continue;
        const dl = a.lane - b.lane;
        if (Math.abs(dl) > laneGap) continue;
        const push = (laneGap - Math.abs(dl)) * 0.5 * (Math.sign(dl) || 1);
        a.nudge(push * 0.5, 0, 0);
        b.nudge(-push * 0.5, 0, 0);
        if (a.s < b.s) a.speed = Math.min(a.speed, b.speed + 0.5);
        else b.speed = Math.min(b.speed, a.speed + 0.5);
      }
    }
  }

  // ---------------------------------------------------------------- camera
  // One rig per machine kind (see CAMERA.rigs): chase, far chase, cockpit.
  updateCamera(dt) {
    const p = this.player;
    const cam = this.camera;
    const kind = p.spec.kind;
    const rig = CAMERA.rigs[kind];
    const plane = kind === 'plane';
    let diff = p.heading - this.camHeading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.camHeading += diff * Math.min(1, dt * (this.camMode === 2 ? 20 : plane ? 3.5 : 5));
    CAM_F.set(Math.sin(this.camHeading), 0, Math.cos(this.camHeading));
    const sf = THREE.MathUtils.clamp(Math.abs(p.vf) / p.spec.stats.top, 0, 1.3);
    // planes: the camera follows altitude with a little lag so climbs feel weighty
    this.camY = plane ? this.camY + (p.pos.y - this.camY) * Math.min(1, dt * 4) : p.pos.y;

    this.shake = Math.max(0, this.shake - dt * 2.2);
    const shake = this.shake + p.wallHit * 0.4 + (p.nitroActive ? 0.12 : 0);
    const jx = (Math.random() - 0.5) * shake * 0.35;
    const jy = (Math.random() - 0.5) * shake * 0.25;

    if (this.camMode === 2) {
      const [fwd, h] = rig.cockpit;
      cam.position.set(p.pos.x + CAM_F.x * fwd + jx, p.pos.y + h + jy, p.pos.z + CAM_F.z * fwd);
      LOOK.copy(p.pos).addScaledVector(CAM_F, 25);
      LOOK.y = p.pos.y + h * 0.85 + (plane ? (p.vy / Math.max(p.speed, 1)) * 25 : 0);
    } else {
      const [d, h] = this.camMode === 1 ? rig.far : rig.chase;
      const dist = d + sf * d * 0.18;
      cam.position.set(p.pos.x - CAM_F.x * dist + jx, this.camY + h - sf * 0.3 + jy, p.pos.z - CAM_F.z * dist);
      LOOK.copy(p.pos).addScaledVector(CAM_F, plane ? 12 : 5);
      LOOK.y = p.pos.y + (plane ? 1 : kind === 'boat' ? 1.4 : 1.0);
    }
    cam.lookAt(LOOK);
    if (plane) cam.rotateZ(-p.bank * (this.camMode === 2 ? 0.8 : 0.22));
    else if ((kind === 'bike' || kind === 'jetski') && this.camMode === 2) {
      const lean = THREE.MathUtils.clamp(Math.atan((-p.yawRate * p.vf) / 9.8), -0.8, 0.8);
      cam.rotateZ(-lean * 0.6);
    }
    const fov = CAMERA.baseFov + CAMERA.speedFov * Math.min(1, sf) + (p.nitroActive ? CAMERA.nitroFov : 0);
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 4);
    cam.updateProjectionMatrix();
  }

  updateAudio(ctl) {
    const p = this.player;
    const plane = p.spec.kind === 'plane';
    const { rpm } = gearFor(plane ? p.vf * 0.6 : p.vf);
    const idle = Math.abs(p.vf) < 1;
    this.audio.update({
      rpm: idle ? 0.15 + ctl.throttle * 0.8 : rpm,
      load: ctl.throttle,
      nitro: p.nitroActive,
      skid: p.drifting ? Math.abs(p.vr) : p.scraping ? 4 : 0,
      pitchMul: ENGINE_PITCH[p.spec.variant || p.spec.kind] || 1,
    });
  }

  updateHud(dt) {
    const p = this.player;
    const order = [...this.racers].sort((a, b) => {
      const sa = a.finished ? 1e9 - a.finishTime : a.progress;
      const sb = b.finished ? 1e9 - b.finishTime : b.progress;
      return sb - sa;
    });
    const racing = this.state === 'racing';
    this.hud.update({
      dt,
      speed: p.vf,
      nitro: p.nitro,
      nitroActive: p.nitroActive,
      nitroPhase: p.nitroPhase,
      nitroEta: p.nitroEta,
      position: order.indexOf(p) + 1,
      racers: this.racers.length,
      lap: Math.max(1, p.lapCounter + 1),
      laps: RACE.laps,
      lapTime: racing ? this.raceTime - this.lapStart : 0,
      bestLap: Math.min(this.raceBest, this.bestLap || Infinity),
      total: racing ? this.raceTime : 0,
    });
    this.minimap.draw(this.racers, p);
  }

  showResults() {
    this.state = 'finished';
    this.hud.show(false);
    const total = RACE.laps * this.track.length;
    const rows = this.racers.map((r) => {
      const speed = Math.max(25, r.isPlayer ? Math.abs(r.vf) : r.speed);
      return {
        r,
        est: !r.finished,
        time: r.finished ? r.finishTime : this.raceTime + Math.max(0, total - r.progress) / speed,
      };
    }).sort((a, b) => a.time - b.time);
    const place = rows.findIndex((x) => x.r.isPlayer) + 1;
    const winner = rows[0].time;
    $('results-title').textContent = place === 1 ? 'You won' : `You finished ${ordinal(place)}`;
    $('results-sub').textContent = `Best lap ${formatTime(this.raceBest)}  ·  Personal best ${formatTime(this.bestLap)}`;
    $('results-body').innerHTML = rows.map((x, i) => `
      <tr class="${x.r.isPlayer ? 'is-you' : ''}">
        <td>${i + 1}</td>
        <td>${x.r.isPlayer ? 'You' : x.r.name}</td>
        <td>${x.r.spec.name}</td>
        <td>${i === 0 ? formatTime(x.time) : `+${(x.time - winner).toFixed(3)}${x.est ? ' (est.)' : ''}`}</td>
      </tr>`).join('');
    $('results').hidden = false;
    $('again-btn').focus();
  }
}
