import * as THREE from 'three';
import { RACE, VEHICLES, AI_ROSTER, CAMERA, STORAGE_KEY } from '../config.js';
import { Track } from '../world/Track.js';
import { buildEnvironment } from '../world/Environment.js';
import { Vehicle } from '../vehicles/Vehicle.js';
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
  }

  init() {
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    r.setSize(window.innerWidth, window.innerHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.2;
    this.root.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAMERA.baseFov, window.innerWidth / window.innerHeight, 0.1, 3000);
    this.track = new Track();
    buildEnvironment(this.scene, this.track);
    const pmrem = new THREE.PMREMGenerator(r);
    setVehicleEnvironment(pmrem.fromScene(new RoomEnvironment(r), 0.04).texture);
    pmrem.dispose();
    this.particles = new Particles(this.scene);
    this.input = new Input();
    this.audio = new AudioEngine();
    this.hud = new HUD();
    this.minimap = new Minimap($('minimap'), this.track);

    const initial = this.saved.vehicle;
    this.menu = new Menu({
      initial,
      onChange: (spec, color) => {
        this.selection = { spec, color };
        this.persist({ vehicle: { id: spec.id, color } });
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
  gridSlot(k) {
    const row = Math.floor(k / 2);
    return { index: this.track.count - 6 - row * 7, lateral: k % 2 ? 4.8 : -4.8 };
  }

  buildGrid() {
    for (const x of this.racers) x.dispose(this.scene);
    const { spec, color } = this.selection;
    this.player = new Vehicle(spec, color, this.track, this.scene);
    this.ais = [];
    const slots = [...Array(RACE.opponents + 1).keys()].filter((k) => k !== RACE.playerGridSlot);
    AI_ROSTER.slice(0, RACE.opponents).forEach((driver, k) => {
      const aiSpec = VEHICLES[(k + 1) % VEHICLES.length];
      const aiColor = aiSpec.colors[(k + 1) % aiSpec.colors.length];
      const ai = new AIRacer(aiSpec, aiColor, this.track, this.scene, driver);
      const g = this.gridSlot(slots[k]);
      ai.placeOnGrid(g.index, g.lateral);
      this.ais.push(ai);
    });
    const g = this.gridSlot(RACE.playerGridSlot);
    this.player.placeOnGrid(g.index, g.lateral);
    this.racers = [this.player, ...this.ais];
    this.camHeading = this.player.heading;
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
    if (this.state !== 'paused') this.particles.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  menuFrame(dt) {
    this.menuAngle += dt * 0.3;
    const p = this.player;
    const bike = p.spec.kind === 'bike';
    const d = bike ? 5.2 : 7.5;
    const a = p.heading + this.menuAngle;
    this.camera.position.set(p.pos.x + Math.sin(a) * d, bike ? 1.9 : 2.6, p.pos.z + Math.cos(a) * d);
    // offset the subject toward the right so the menu panel doesn't cover it
    LOOK.set(Math.cos(a), 0, -Math.sin(a)).multiplyScalar(window.innerWidth > 820 ? -1.8 : 0);
    this.camera.lookAt(p.pos.x + LOOK.x, bike ? 0.8 : 0.7, p.pos.z + LOOK.z);
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
    const control = p.finished ? { throttle: 0.4, brake: 0, steer: this.autoSteer(), handbrake: false, nitro: false } : ctl;
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
        const pb = this.saved.bestLap || Infinity;
        this.raceBest = Math.min(this.raceBest, lt);
        if (lt < pb) {
          this.persist({ bestLap: lt });
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
    if (p.drifting) this.particles.tyreSmoke(p.pos, p.heading, Math.min(1, Math.abs(p.vr) / 10), p.spec.kind === 'car');
    if (p.impact > 3) {
      this.audio.impact(p.impact);
      this.shake = Math.min(1, this.shake + p.impact * 0.04);
      this.particles.sparkBurst(p.pos, p.vel.clone().normalize(), Math.min(14, 3 + p.impact | 0));
    } else if (p.scraping && Math.abs(p.vf) > 12 && Math.random() < 0.5) {
      this.particles.sparkBurst(p.pos, p.vel.clone().normalize(), 1);
    }
    if (p.wrongWay > 1.2 && !p.finished) this.hud.wrongWay(true);

    this.updateCamera(dt);
    this.updateAudio(control);
    if (this.state === 'racing') this.updateHud(dt);
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
    for (const a of this.ais) {
      const dx = p.pos.x - a.pos.x;
      const dz = p.pos.z - a.pos.z;
      const d2 = dx * dx + dz * dz;
      const min = (p.radius + a.radius) * 0.85;
      if (d2 > min * min || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const nz = dz / d;
      const overlap = min - d;
      p.pos.x += nx * overlap * 0.6;
      p.pos.z += nz * overlap * 0.6;
      const rel = (p.vel.x - a.vel.x) * nx + (p.vel.z - a.vel.z) * nz;
      const alongN = nx * a.tangent.x + nz * a.tangent.z;
      const sideN = nx * a.right.x + nz * a.right.z;
      if (rel < 0) {
        p.vel.x -= nx * rel * 0.75;
        p.vel.z -= nz * rel * 0.75;
        a.nudge(-sideN * overlap * 0.5, -alongN * overlap * 0.3, -rel * 0.45 * -alongN);
        if (-rel > 2) {
          this.audio.impact(-rel);
          this.shake = Math.min(1, this.shake + -rel * 0.05);
          MID.set((p.pos.x + a.pos.x) / 2, 0, (p.pos.z + a.pos.z) / 2);
          this.particles.sparkBurst(MID, MID.set(nx, 0, nz), 6);
        }
      } else {
        a.nudge(-sideN * overlap * 0.4, 0, 0);
      }
    }
    // AI vs AI: keep them from overlapping by spreading lanes
    for (let i = 0; i < this.ais.length; i++) {
      for (let j = i + 1; j < this.ais.length; j++) {
        const a = this.ais[i];
        const b = this.ais[j];
        if (Math.abs(a.s - b.s) > 4.5) continue;
        const dl = a.lane - b.lane;
        if (Math.abs(dl) > 2.6) continue;
        const push = (2.6 - Math.abs(dl)) * 0.5 * (Math.sign(dl) || 1);
        a.nudge(push * 0.5, 0, 0);
        b.nudge(-push * 0.5, 0, 0);
        if (a.s < b.s) a.speed = Math.min(a.speed, b.speed + 0.5);
        else b.speed = Math.min(b.speed, a.speed + 0.5);
      }
    }
  }

  // ---------------------------------------------------------------- camera
  updateCamera(dt) {
    const p = this.player;
    const cam = this.camera;
    const bike = p.spec.kind === 'bike';
    let diff = p.heading - this.camHeading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.camHeading += diff * Math.min(1, dt * (this.camMode === 2 ? 20 : 5));
    CAM_F.set(Math.sin(this.camHeading), 0, Math.cos(this.camHeading));
    const sf = THREE.MathUtils.clamp(Math.abs(p.vf) / p.spec.stats.top, 0, 1.3);

    this.shake = Math.max(0, this.shake - dt * 2.2);
    const shake = this.shake + p.wallHit * 0.4 + (p.nitroActive ? 0.12 : 0);
    const jx = (Math.random() - 0.5) * shake * 0.35;
    const jy = (Math.random() - 0.5) * shake * 0.25;

    if (this.camMode === 2) {
      const fwd = bike ? 0.35 : 0.6;
      cam.position.set(p.pos.x + CAM_F.x * fwd + jx, (bike ? 1.55 : 1.2) + jy, p.pos.z + CAM_F.z * fwd);
      LOOK.copy(p.pos).addScaledVector(CAM_F, 25).setY(bike ? 1.2 : 1.0);
    } else {
      const far = this.camMode === 1;
      const dist = (far ? 10.5 : bike ? 4.3 : 6.6) + sf * (bike ? 0.9 : 1.4);
      const h = (far ? 3.8 : bike ? 1.85 : 2.5) - sf * 0.3;
      cam.position.set(p.pos.x - CAM_F.x * dist + jx, h + jy, p.pos.z - CAM_F.z * dist);
      LOOK.copy(p.pos).addScaledVector(CAM_F, 5).setY(bike ? 1.1 : 1.0);
    }
    cam.lookAt(LOOK);
    if (bike && this.camMode === 2) {
      const lean = THREE.MathUtils.clamp(Math.atan((-p.yawRate * p.vf) / 9.8), -0.8, 0.8);
      cam.rotateZ(-lean * 0.6);
    }
    const fov = CAMERA.baseFov + CAMERA.speedFov * Math.min(1, sf) + (p.nitroActive ? CAMERA.nitroFov : 0);
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 4);
    cam.updateProjectionMatrix();
  }

  updateAudio(ctl) {
    const p = this.player;
    const { rpm } = gearFor(p.vf);
    const idle = Math.abs(p.vf) < 1;
    this.audio.update({
      rpm: idle ? 0.15 + ctl.throttle * 0.8 : rpm,
      load: ctl.throttle,
      nitro: p.nitroActive,
      skid: p.drifting ? Math.abs(p.vr) : p.scraping ? 4 : 0,
      pitchMul: p.spec.kind === 'bike' ? 1.55 : 1,
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
      position: order.indexOf(p) + 1,
      racers: this.racers.length,
      lap: Math.max(1, p.lapCounter + 1),
      laps: RACE.laps,
      lapTime: racing ? this.raceTime - this.lapStart : 0,
      bestLap: Math.min(this.raceBest, this.saved.bestLap || Infinity),
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
    $('results-sub').textContent = `Best lap ${formatTime(this.raceBest)}  ·  Personal best ${formatTime(this.saved.bestLap)}`;
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
