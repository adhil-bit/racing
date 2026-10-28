import * as THREE from 'three';
import { NITRO } from '../config.js';
import { buildModel, animateModel } from './models.js';

// Collision footprint per kind: halfWidth for walls, radius for racer contact.
export const DIMS = {
  car: { halfWidth: 1.05, radius: 1.7 },
  bike: { halfWidth: 0.45, radius: 1.1 },
  boat: { halfWidth: 1.3, radius: 2.8 },
  jetski: { halfWidth: 0.5, radius: 1.3 },
  plane: { halfWidth: 4.2, radius: 4.6 },
};
export const isWater = (kind) => kind === 'boat' || kind === 'jetski';

const F = new THREE.Vector3();
const R = new THREE.Vector3();
const clamp = THREE.MathUtils.clamp;

// Player vehicle: arcade "bicycle model".
// World velocity is kept between frames; each frame it is re-decomposed into
// the new heading's forward/lateral axes and lateral speed is damped by grip.
// Low grip (handbrake) => the old velocity survives the rotation => drift.
export class Vehicle {
  constructor(spec, color, track, scene, name = 'You') {
    this.spec = spec;
    this.track = track;
    this.name = name;
    this.isPlayer = true;
    this.model = buildModel(spec, color);
    scene.add(this.model.root);
    this.halfWidth = DIMS[spec.kind].halfWidth;
    this.radius = DIMS[spec.kind].radius;
    this.water = isWater(spec.kind);
    this.time = Math.random() * 10;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();

    if (spec.kind !== 'plane') {
      const head = new THREE.SpotLight(0xf2f5ff, 140, 120, 0.42, 0.6, 1.3);
      head.position.set(0, this.water ? 1.6 : 1.1, this.water ? 2.5 : 1.6);
      head.target.position.set(0, 0, 30);
      this.model.root.add(head, head.target);
    }
    this.reset();
  }

  reset() {
    this.heading = 0;
    this.vel.set(0, 0, 0);
    this.vf = 0;
    this.vr = 0;
    this.steer = 0;
    this.yawRate = 0;
    this.nitro = 1;              // bar fill 0..1
    this.nitroPhase = 'ready';   // ready -> boost -> charging -> ready
    this.nitroTimer = 0;
    this.nitroHeld = false;
    this.nitroReadyEvent = false;
    this.nitroActive = false;
    this.drifting = false;
    this.braking = false;
    this.throttle = 0;
    this.wallHit = 0;
    this.scraping = false;
    this.wrongWay = 0;
    this.trackIndex = -1;
    this.local = 0;
    this.lapCounter = -1;
    this.progress = 0;
    this.finished = false;
    this.finishTime = 0;
    this.pitch = 0;
    this.lateral = 0;
    this.impact = 0;
  }

  placeOnGrid(index, lateral) {
    this.reset();
    const t = this.track;
    const i = t.wrap(index);
    this.pos.copy(t.points[i]).addScaledVector(t.rights[i], lateral);
    this.heading = Math.atan2(t.tangents[i].x, t.tangents[i].z);
    this.trackIndex = i;
    this.local = i * t.segLen;
    this.lapCounter = this.local > t.length / 2 ? -1 : 0;
    this.progress = this.lapCounter * t.length + this.local;
    this.syncModel(0);
  }

  // Put the vehicle back on the centreline, facing the right way.
  recover() {
    const i = this.trackIndex;
    const t = this.track;
    const lap = this.lapCounter;
    this.pos.copy(t.points[i]);
    this.heading = Math.atan2(t.tangents[i].x, t.tangents[i].z);
    this.vel.set(0, 0, 0);
    this.lapCounter = lap;
  }

  updateProgress() {
    const t = this.track;
    const pr = t.project(this.pos, this.trackIndex);
    this.trackIndex = pr.index;
    this.lateral = pr.lateral;
    const L = t.length;
    let local = pr.index * t.segLen + pr.along;
    local = ((local % L) + L) % L;
    if (this.local > L * 0.75 && local < L * 0.25) this.lapCounter++;
    else if (this.local < L * 0.25 && local > L * 0.75) this.lapCounter--;
    this.local = local;
    this.progress = this.lapCounter * L + local;
    return pr;
  }

  axes() {
    F.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    R.set(-F.z, 0, F.x);
  }

  update(dt, ctl, canMove) {
    const s = this.spec.stats;
    this.impact = 0;
    this.throttle = ctl.throttle;
    const throttle = canMove ? ctl.throttle : 0;
    const brake = canMove ? ctl.brake : 1;
    const hand = canMove && ctl.handbrake;

    this.axes();
    let vf = this.vel.dot(F);
    let vr = this.vel.dot(R);

    this.updateNitro(dt, ctl, canMove, vf);
    const top = s.top * (this.nitroActive ? s.nitro : 1);

    // longitudinal
    const prevVf = vf;
    if (throttle > 0) {
      if (vf < -1) vf += s.brake * throttle * dt;
      else vf += s.accel * (this.nitroActive ? 1.7 : 1) * throttle * Math.max(0.05, 1 - vf / top) * dt;
    }
    if (brake > 0) {
      if (vf > 1) vf -= s.brake * brake * dt;
      else if (canMove) vf = Math.max(-16, vf - 12 * brake * dt);
      else vf *= Math.max(0, 1 - 8 * dt);
    }
    const coastDrag = this.water ? 4 + Math.abs(vf) * 0.12 : 2.5 + Math.abs(vf) * 0.03;
    if (throttle === 0 && brake === 0) vf -= Math.sign(vf) * Math.min(Math.abs(vf), coastDrag * dt);
    if (vf > top) vf -= (vf - top) * 1.2 * dt;
    if (hand) vf -= Math.sign(vf) * Math.min(Math.abs(vf), s.brake * 0.45 * dt);
    this.braking = (brake > 0 || hand) && vf > 1;
    this.pitch += ((clamp((prevVf - vf) / dt, -30, 50) * 0.002) - this.pitch) * Math.min(1, dt * 6);

    this.vel.copy(F).multiplyScalar(vf).addScaledVector(R, vr);

    // steering: authority fades in from standstill and tapers at top speed
    const target = canMove ? ctl.steer : 0;
    this.steer += (target - this.steer) * Math.min(1, dt * (target === 0 ? 7 : 4.5));
    const spd = Math.abs(vf);
    const auth = Math.min(1, spd / 6) * (1 - 0.5 * Math.min(1, spd / s.top));
    this.yawRate = -this.steer * s.handling * auth * (vf >= 0 ? 1 : -1) * (hand ? 1.45 : 1);
    this.heading += this.yawRate * dt;

    // re-decompose in the new frame and apply lateral grip
    this.axes();
    vf = this.vel.dot(F);
    vr = this.vel.dot(R);
    const grip = hand ? 1.4 : s.grip;
    vr *= Math.exp(-grip * dt);
    this.vel.copy(F).multiplyScalar(vf).addScaledVector(R, vr);

    this.pos.addScaledVector(this.vel, dt);

    // walls: clamp to the corridor, kill the into-wall component, scrape speed
    const pr = this.updateProgress();
    const limit = this.track.width / 2 + this.track.wallOffset - 0.3 - this.halfWidth;
    this.wallHit = Math.max(0, this.wallHit - dt * 3);
    this.scraping = false;
    if (Math.abs(pr.lateral) > limit) {
      const side = Math.sign(pr.lateral);
      const r = this.track.rights[pr.index];
      this.pos.addScaledVector(r, -side * (Math.abs(pr.lateral) - limit));
      const into = this.vel.dot(r) * side;
      if (into > 0) {
        this.vel.addScaledVector(r, -side * into * 1.35);
        this.wallHit = Math.min(1, Math.max(this.wallHit, into / 14 + 0.15));
        this.impact = into;
      }
      this.vel.multiplyScalar(1 - Math.min(0.5, 1.1 * dt));
      // steer the nose back along the wall so you don't get pinned
      const t = this.track.tangents[pr.index];
      const along = Math.atan2(t.x, t.z);
      let diff = along - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (Math.abs(diff) < Math.PI / 2) this.heading += diff * Math.min(1, dt * 2.5);
      this.scraping = true;
    }

    this.axes();
    this.vf = this.vel.dot(F);
    this.vr = this.vel.dot(R);
    this.drifting = Math.abs(this.vr) > 4.5 && Math.abs(this.vf) > 14;

    const t = this.track.tangents[this.trackIndex];
    const facing = F.x * t.x + F.z * t.z;
    this.wrongWay = facing < -0.3 && this.vf > 6 ? this.wrongWay + dt : 0;

    this.syncModel(dt);
  }

  // Tap-to-fire burst. Holding the key doesn't re-fire; it needs a fresh press.
  updateNitro(dt, ctl, canMove, vf) {
    const pressed = ctl.nitroPress ?? (ctl.nitro && !this.nitroHeld);
    this.nitroHeld = ctl.nitro;
    this.nitroReadyEvent = false;
    if (this.nitroPhase === 'ready' && pressed && canMove && vf > 4) {
      this.nitroPhase = 'boost';
      this.nitroTimer = NITRO.duration;
    }
    if (this.nitroPhase === 'boost') {
      this.nitroTimer -= dt;
      this.nitro = Math.max(0, this.nitroTimer / NITRO.duration);
      if (this.nitroTimer <= 0) {
        this.nitroPhase = 'charging';
        this.nitro = 0;
      }
    } else if (this.nitroPhase === 'charging') {
      this.nitro += (dt / NITRO.recharge) * (this.drifting ? NITRO.driftMultiplier : 1);
      if (this.nitro >= 1) {
        this.nitro = 1;
        this.nitroPhase = 'ready';
        this.nitroReadyEvent = true;
      }
    }
    this.nitroActive = this.nitroPhase === 'boost';
  }

  get nitroEta() {
    return this.nitroPhase === 'charging' ? (1 - this.nitro) * NITRO.recharge : 0;
  }

  syncModel(dt) {
    const m = this.model;
    this.time += dt;
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.heading;
    // lean = atan(lateral accel / g); yawRate<0 means turning right => lean right (+)
    const lean = clamp(Math.atan((-this.yawRate * this.vf) / 9.8), -0.8, 0.8);
    let pitch = this.pitch;
    let bob = 0;
    if (this.water) {
      // hull rides the chop; bow lifts as it gets up on the plane
      const sp = Math.min(1, Math.abs(this.vf) / 25);
      bob = Math.sin(this.time * 2.3 + this.pos.x * 0.07) * 0.07 + Math.sin(this.time * 3.7 + this.pos.z * 0.05) * 0.05 * (1 + sp);
      pitch = this.pitch * 1.5 - 0.07 * sp + Math.sin(this.time * 5.1) * 0.012 * sp;
    }
    animateModel(m, {
      dt, speed: this.vf, steer: this.steer, lean, pitch, bob,
      nitro: this.nitroActive, braking: this.braking,
    });
  }

  dispose(scene) {
    scene.remove(this.model.root);
  }
}
