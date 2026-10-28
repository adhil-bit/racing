import * as THREE from 'three';

// Closed Catmull-Rom spline through the mode's control points, resampled at
// equal arc-length. Control points are [x, z] or [x, z, altitude].
export class Track {
  constructor(def) {
    this.def = def;
    this.width = def.width;
    this.curbWidth = def.curbWidth ?? 0;
    this.wallOffset = def.wallOffset ?? 1.9;
    this.wallHeight = def.wallHeight ?? 1.2;
    this.height = def.height ?? 0; // air: vertical size of the gate corridor
    const pts = def.control.map(([x, z, y = 0]) => new THREE.Vector3(x * def.scale, y, z * def.scale));
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    this.length = this.curve.getLength();
    const N = (this.count = def.samples ?? 1600);
    this.segLen = this.length / N;
    this.points = [];
    this.tangents = [];   // horizontal, normalised
    this.tangents3 = [];  // full 3D (for gate orientation)
    this.rights = [];
    for (let i = 0; i < N; i++) {
      const u = i / N;
      const p = this.curve.getPointAt(u);
      const t3 = this.curve.getTangentAt(u).normalize();
      const t = t3.clone();
      t.y = 0;
      t.normalize();
      this.points.push(p);
      this.tangents.push(t);
      this.tangents3.push(t3);
      // right-hand vector for a +Z-forward, +Y-up frame
      this.rights.push(new THREE.Vector3(-t.z, 0, t.x));
    }
    // signed curvature (positive = left-hander) and slope (rise / run)
    this.curvature = new Float32Array(N);
    this.slope = new Float32Array(N);
    const k = 6;
    for (let i = 0; i < N; i++) {
      const a = this.tangents[i];
      const b = this.tangents[(i + k) % N];
      const ang = Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1));
      const sign = Math.sign(a.z * b.x - a.x * b.z) || 1;
      this.curvature[i] = (sign * ang) / (k * this.segLen);
      this.slope[i] = (this.points[(i + 1) % N].y - this.points[i].y) / this.segLen;
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
    out.slope = this.slope[i];
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
