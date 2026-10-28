import * as THREE from 'three';
import { TRACK } from '../config.js';

// Circuit control points (x, z) in "units"; scaled to metres below.
// Closed Catmull-Rom spline -> resampled at equal arc-length.
const CONTROL = [
  [0, 0], [0, 38], [6, 58], [22, 70], [42, 68], [52, 56], [52, 42],
  [62, 32], [80, 34], [94, 46], [110, 50], [124, 40], [128, 20],
  [118, 4], [100, 0], [86, -10], [80, -28], [66, -42], [42, -42],
  [26, -32], [10, -26], [0, -14],
];
const SCALE = 8.5;

export class Track {
  constructor() {
    const pts = CONTROL.map(([x, z]) => new THREE.Vector3(x * SCALE, 0, z * SCALE));
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    this.length = this.curve.getLength();
    const N = (this.count = TRACK.samples);
    this.segLen = this.length / N;
    this.points = [];
    this.tangents = [];
    this.rights = [];
    for (let i = 0; i < N; i++) {
      const u = i / N;
      const p = this.curve.getPointAt(u);
      const t = this.curve.getTangentAt(u);
      t.y = 0;
      t.normalize();
      this.points.push(p);
      this.tangents.push(t);
      // right-hand vector for a +Z-forward, +Y-up frame
      this.rights.push(new THREE.Vector3(-t.z, 0, t.x));
    }
    // signed curvature (positive = left-hander)
    this.curvature = new Float32Array(N);
    const k = 6;
    for (let i = 0; i < N; i++) {
      const a = this.tangents[i];
      const b = this.tangents[(i + k) % N];
      const ang = Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1));
      const sign = Math.sign(a.z * b.x - a.x * b.z) || 1;
      this.curvature[i] = (sign * ang) / (k * this.segLen);
    }
    this.bounds = new THREE.Box3().setFromPoints(this.points);
  }

  wrap(i) {
    const N = this.count;
    return ((i % N) + N) % N;
  }

  // Nearest centreline sample to a world position. A hint index keeps the
  // search local (O(60) instead of O(N)) and stops snapping across the infield.
  project(pos, hint = -1) {
    let best = 0;
    let bestD = Infinity;
    const scan = (i) => {
      const p = this.points[i];
      const dx = pos.x - p.x;
      const dz = pos.z - p.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    };
    if (hint < 0) for (let i = 0; i < this.count; i++) scan(i);
    else for (let o = -30; o <= 30; o++) scan(this.wrap(hint + o));
    const p = this.points[best];
    const t = this.tangents[best];
    const r = this.rights[best];
    const dx = pos.x - p.x;
    const dz = pos.z - p.z;
    return { index: best, lateral: dx * r.x + dz * r.z, along: dx * t.x + dz * t.z };
  }

  // Interpolated frame at a distance along the lap (wraps both directions).
  sample(dist, out) {
    const L = this.length;
    const d = ((dist % L) + L) % L;
    const f = d / this.segLen;
    const i = Math.floor(f) % this.count;
    const j = (i + 1) % this.count;
    const a = f - Math.floor(f);
    out.pos.lerpVectors(this.points[i], this.points[j], a);
    out.tan.lerpVectors(this.tangents[i], this.tangents[j], a).normalize();
    out.right.set(-out.tan.z, 0, out.tan.x);
    out.index = i;
    return out;
  }

  // Sharpest |curvature| in the next `samples` points — drives AI braking.
  curvatureAhead(index, samples) {
    let m = 0;
    for (let o = 0; o < samples; o += 2) {
      const c = Math.abs(this.curvature[this.wrap(index + o)]);
      if (c > m) m = c;
    }
    return m;
  }
}
