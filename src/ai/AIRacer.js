import * as THREE from 'three';
import { buildModel, animateModel } from '../vehicles/models.js';
import { DIMS, isWater } from '../vehicles/Vehicle.js';

const frame = { pos: new THREE.Vector3(), tan: new THREE.Vector3(), right: new THREE.Vector3(), index: 0 };

// Kinematic AI: drives along the centreline in "distance" space (s) with a
// lateral lane offset. Cheap, never leaves the track, and still reads as
// racing thanks to corner braking, lane changes and lean/steer animation.
export class AIRacer {
  constructor(spec, color, track, scene, { name, skill, cornerGrip = 54, pace = 1 }) {
    this.spec = spec;
    this.track = track;
    this.name = name;
    this.skill = skill;
    this.isPlayer = false;
    this.cornerGrip = cornerGrip;
    this.pace = pace;
    this.flying = spec.kind === 'plane';
    this.water = isWater(spec.kind);
    this.model = buildModel(spec, color);
    scene.add(this.model.root);
    this.radius = DIMS[spec.kind].radius;
    this.time = Math.random() * 10;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.reset();
  }

  reset() {
    this.s = 0;
    this.speed = 0;
    this.lane = 0;
    this.laneTarget = 0;
    this.laneTimer = 2 + Math.random() * 4;
    this.laneVel = 0;
    this.alt = 0;          // planes: height offset inside the gate corridor
    this.altTarget = 0;
    this.nitroTimer = 0;
    this.finished = false;
    this.finishTime = 0;
    this.braking = false;
    this.launchDelay = 0.05 + Math.random() * 0.35;
  }

  placeOnGrid(index, lateral) {
    this.reset();
    const t = this.track;
    // grid sits behind the line, so distance is negative until first crossing
    const i = index >= t.count / 2 ? index - t.count : index;
    this.s = i * t.segLen;
    this.lane = this.laneTarget = lateral;
    this.update(0, false, 0);
  }

  get progress() { return this.s; }

  update(dt, racing, playerProgress, playerLateral = 0) {
    const t = this.track;
    t.sample(this.s, frame);
    const idx = frame.index;
    const top = this.spec.stats.top * this.skill * 1.04 * this.pace;

    if (racing) {
      if (this.launchDelay > 0) this.launchDelay -= dt;
      else {
        // corner speed from v = sqrt(a_lat / curvature), looking further ahead at speed
        const look = Math.round((25 + this.speed * 1.6) / t.segLen);
        const kappa = Math.max(1e-4, t.curvatureAhead(idx, look));
        let target = Math.min(top, Math.sqrt((this.cornerGrip * this.skill) / kappa));

        // rubber band: gentle, so a clean lap still wins
        const gap = playerProgress - this.s;
        if (gap > 0) target *= 1 + Math.min(0.12, gap / 1800);
        else target *= 1 - Math.min(0.07, -gap / 3000);

        if (this.finished) target = Math.min(target, 30);

        // AI nitro on long straights
        this.nitroTimer = Math.max(0, this.nitroTimer - dt);
        if (!this.finished && kappa < 0.002 && this.speed > top * 0.8 && Math.random() < dt * 0.15) this.nitroTimer = 2.2;
        if (this.nitroTimer > 0) target *= 1.18;

        const accel = this.spec.stats.accel * (this.nitroTimer > 0 ? 1.5 : 1);
        const diff = target - this.speed;
        this.braking = diff < -2;
        this.speed += THREE.MathUtils.clamp(diff, -this.spec.stats.brake * dt, accel * dt * Math.max(0.2, 1 - this.speed / (top * 1.25)));
        if (this.flying) this.speed = Math.max(40, this.speed);
      }
    } else if (!this.flying) {
      this.speed = Math.max(0, this.speed - 20 * dt);
    }
    this.s += this.speed * dt;

    // lane choice: wander, and dodge a player directly ahead
    this.laneTimer -= dt;
    const maxLane = t.width / 2 - (this.flying ? 6 : this.water ? 3.2 : 2.2);
    if (this.laneTimer <= 0) {
      this.laneTimer = 3 + Math.random() * 5;
      this.laneTarget = (Math.random() * 2 - 1) * maxLane * 0.8;
      if (this.flying) this.altTarget = (Math.random() * 2 - 1) * (t.height / 2 - 5);
    }
    if (this.flying) this.alt += (this.altTarget - this.alt) * Math.min(1, dt * 0.6);
    const ahead = playerProgress - this.s;
    if (ahead > 0 && ahead < (this.flying ? 40 : 18) && Math.abs(playerLateral - this.lane) < (this.flying ? 8 : 3.2)) {
      const dodge = this.flying ? 13 : 5;
      this.laneTarget = playerLateral > 0 ? playerLateral - dodge : playerLateral + dodge;
    }
    this.laneTarget = THREE.MathUtils.clamp(this.laneTarget, -maxLane, maxLane);
    const prevLane = this.lane;
    this.lane += (this.laneTarget - this.lane) * Math.min(1, dt * 0.9);
    this.lane = THREE.MathUtils.clamp(this.lane, -maxLane, maxLane);
    this.laneVel = dt > 0 ? (this.lane - prevLane) / dt : 0;

    t.sample(this.s, frame);
    this.pos.copy(frame.pos).addScaledVector(frame.right, this.lane);
    if (this.flying) this.pos.y += this.alt;
    const base = Math.atan2(frame.tan.x, frame.tan.z);
    this.heading = base - Math.atan2(this.laneVel, Math.max(this.speed, 4));
    this.vel.copy(frame.tan).multiplyScalar(this.speed).addScaledVector(frame.right, this.laneVel);
    this.vel.y = this.flying ? frame.slope * this.speed : 0;
    this.right = frame.right;
    this.tangent = frame.tan;

    const kappa = t.curvature[frame.index];
    const maxLean = this.flying ? 1.1 : 0.75;
    const lean = THREE.MathUtils.clamp(Math.atan((-kappa * this.speed * this.speed) / 9.8) * (this.flying ? 0.85 : 1), -maxLean, maxLean);
    this.time += dt;
    let pitch = this.braking ? 0.03 : 0;
    let bob = 0;
    if (this.flying) pitch = -Math.atan(frame.slope);
    else if (this.water) {
      const sp = Math.min(1, this.speed / 25);
      bob = Math.sin(this.time * 2.3 + this.pos.x * 0.07) * 0.07 + Math.sin(this.time * 3.7 + this.pos.z * 0.05) * 0.05 * (1 + sp);
      pitch = -0.07 * sp + (this.braking ? 0.04 : 0);
    }
    const m = this.model;
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.heading;
    animateModel(m, {
      dt, speed: this.speed, steer: THREE.MathUtils.clamp(-kappa * 25 + this.laneVel * 0.1, -1, 1),
      lean, pitch, bob, nitro: this.nitroTimer > 0, braking: this.braking,
    });
  }

  // Called by collision resolution: shove sideways / along the track.
  nudge(lateral, along, speedDelta) {
    this.lane += lateral;
    this.laneTarget += lateral * 0.5;
    this.s += along;
    this.speed = Math.max(0, this.speed + speedDelta);
  }

  dispose(scene) {
    scene.remove(this.model.root);
  }
}
