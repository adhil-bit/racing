import * as THREE from 'three';
import { Vehicle } from './Vehicle.js';
import { animateModel } from './models.js';

const clamp = THREE.MathUtils.clamp;

// Arcade flight: always-on thrust, coordinated turns (no sideslip), climb and
// dive with ↑/↓. Climbing trades speed for height and diving gives it back.
// The course is a corridor of gates; leaving it scrubs speed and pushes you back.
export class Plane extends Vehicle {
  reset() {
    super.reset();
    this.speed = 0;
    this.vy = 0;
    this.bank = 0;
    this.launched = false;
    this.contrail = false;
  }

  launch(speed) {
    this.launched = true;
    this.speed = speed;
  }

  recover() {
    super.recover();
    this.vy = 0;
    this.speed = Math.max(this.speed, 60);
  }

  update(dt, ctl, canMove) {
    const s = this.spec.stats;
    const t = this.track;
    this.impact = 0;
    this.throttle = ctl.throttle;
    if (!this.launched) { // holding formation until the start
      this.syncModel(dt);
      return;
    }
    this.updateNitro(dt, ctl, canMove, this.speed);
    const airbrake = canMove && ctl.handbrake;
    const top = s.top * (this.nitroActive ? s.nitro : 1);
    const thrust = canMove ? 1 : 0.35;
    this.speed += s.accel * (this.nitroActive ? 1.8 : 1) * thrust * Math.max(0.05, 1 - this.speed / top) * dt;
    if (this.speed > top) this.speed -= (this.speed - top) * dt;
    if (airbrake) this.speed -= s.brake * dt;
    this.speed -= (this.vy / Math.max(this.speed, 1)) * 9.8 * 0.7 * dt;
    this.speed = Math.max(40, this.speed);
    this.braking = airbrake;

    const steer = canMove ? ctl.steer : 0;
    this.steer += (steer - this.steer) * Math.min(1, dt * (steer === 0 ? 4 : 3));
    this.yawRate = -this.steer * s.handling * (airbrake ? 1.35 : 1);
    this.heading += this.yawRate * dt;

    const pitchIn = canMove ? ctl.pitch || 0 : 0;
    this.vy += (pitchIn * s.climb - this.vy) * Math.min(1, dt * 2.2);

    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    this.pos.x += fx * this.speed * dt;
    this.pos.z += fz * this.speed * dt;
    this.pos.y += this.vy * dt;
    this.vel.set(fx * this.speed, this.vy, fz * this.speed);

    // corridor: horizontal and vertical limits around the centreline
    const pr = this.updateProgress();
    const centreY = t.points[pr.index].y + t.slope[pr.index] * pr.along;
    const limH = t.width / 2 - this.halfWidth * 0.5;
    const limV = t.height / 2 - 1.5;
    this.wallHit = Math.max(0, this.wallHit - dt * 3);
    this.scraping = false;
    if (Math.abs(pr.lateral) > limH) {
      const side = Math.sign(pr.lateral);
      this.pos.addScaledVector(t.rights[pr.index], -side * (Math.abs(pr.lateral) - limH));
      const tg = t.tangents[pr.index];
      let diff = Math.atan2(tg.x, tg.z) - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (Math.abs(diff) < Math.PI / 2) this.heading += diff * Math.min(1, dt * 2.5);
      this.scraping = true;
    }
    const dy = this.pos.y - centreY;
    if (Math.abs(dy) > limV) {
      const side = Math.sign(dy);
      this.pos.y = centreY + side * limV;
      if (this.vy * side > 0) this.vy = 0;
      this.scraping = true;
    }
    if (this.scraping) {
      this.speed *= 1 - Math.min(0.5, 0.9 * dt);
      this.wallHit = Math.max(this.wallHit, 0.3);
    }

    this.vf = this.speed;
    this.vr = 0;
    this.drifting = false;
    const tg = t.tangents[this.trackIndex];
    const facing = fx * tg.x + fz * tg.z;
    this.wrongWay = facing < -0.3 ? this.wrongWay + dt : 0;
    this.syncModel(dt);
  }

  syncModel(dt) {
    const m = this.model;
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.heading;
    const bankTarget = clamp(Math.atan((-this.yawRate * this.speed) / 9.8) * 0.85, -1.15, 1.15);
    this.bank += (bankTarget - this.bank) * Math.min(1, dt * 4);
    this.contrail = Math.abs(this.bank) > 0.75 && this.speed > 70;
    const nose = -Math.atan2(this.vy, Math.max(this.speed, 20));
    animateModel(m, {
      dt, speed: this.speed, steer: this.steer, lean: this.bank, pitch: nose,
      nitro: this.nitroActive, braking: this.braking,
    });
  }
}
