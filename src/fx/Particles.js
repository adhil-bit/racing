import * as THREE from 'three';
import { radialTexture } from '../world/textures.js';

// Fixed-size sprite pool: no allocation during the race.
class Pool {
  constructor(scene, size, { color, additive, tex }) {
    this.items = [];
    this.next = 0;
    for (let i = 0; i < size; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex, color, transparent: true, depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      const s = new THREE.Sprite(mat);
      s.visible = false;
      scene.add(s);
      this.items.push({ s, vel: new THREE.Vector3(), life: 0, max: 1, size: 1, grow: 0, gravity: 0, alpha: 1 });
    }
  }

  spawn(pos, vel, { life, size, grow = 0, gravity = 0, alpha = 1 }) {
    const p = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    p.s.position.copy(pos);
    p.vel.copy(vel);
    Object.assign(p, { life, max: life, size, grow, gravity, alpha });
    p.s.visible = true;
  }

  update(dt) {
    for (const p of this.items) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      p.vel.y -= p.gravity * dt;
      p.s.position.addScaledVector(p.vel, dt);
      const k = p.life / p.max;
      const sz = p.size + p.grow * (1 - k);
      p.s.scale.set(sz, sz, 1);
      p.s.material.opacity = p.alpha * k;
    }
  }
}

export class Particles {
  constructor(scene) {
    const soft = radialTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)');
    this.smoke = new Pool(scene, 120, { color: 0xb8c0d8, additive: false, tex: soft });
    this.sparks = new Pool(scene, 80, { color: 0xffb84d, additive: true, tex: soft });
    this.tmp = new THREE.Vector3();
    this.tmpV = new THREE.Vector3();
  }

  tyreSmoke(pos, heading, intensity, wide) {
    const back = -1.6;
    const sides = wide ? [-0.9, 0.9] : [0];
    for (const x of sides) {
      if (Math.random() > intensity) continue;
      const c = Math.cos(heading);
      const s = Math.sin(heading);
      this.tmp.set(pos.x + s * back + -c * x, 0.4, pos.z + c * back + s * x);
      this.tmpV.set((Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2);
      this.smoke.spawn(this.tmp, this.tmpV, { life: 1.2, size: 1.2, grow: 4, alpha: 0.35 });
    }
  }

  sparkBurst(pos, dir, n) {
    for (let i = 0; i < n; i++) {
      this.tmpV.set(dir.x * 6 + (Math.random() - 0.5) * 8, 2 + Math.random() * 4, dir.z * 6 + (Math.random() - 0.5) * 8);
      this.tmp.copy(pos).setY(0.6);
      this.sparks.spawn(this.tmp, this.tmpV, { life: 0.35 + Math.random() * 0.3, size: 0.35, gravity: 14 });
    }
  }

  update(dt) {
    this.smoke.update(dt);
    this.sparks.update(dt);
  }
}
