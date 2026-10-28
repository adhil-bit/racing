import * as THREE from 'three';
import * as tex from './textures.js';
import { buildSky, addLights, buildCity } from './common.js';

// Elliptical ring sized to the flight corridor (half-width a, half-height b).
class EllipseCurve3 extends THREE.Curve {
  constructor(a, b) { super(); this.a = a; this.b = b; }
  getPoint(t, out = new THREE.Vector3()) {
    const th = t * Math.PI * 2;
    return out.set(Math.cos(th) * this.a, Math.sin(th) * this.b, 0);
  }
}

export function buildAirWorld(scene, track) {
  const a = track.width / 2;
  const b = track.height / 2;

  scene.fog = new THREE.Fog(0x9a6a86, 500, 3600);
  const sky = buildSky(scene, { horizon: [1.0, 0.58, 0.36], mid: [0.62, 0.36, 0.5], top: [0.16, 0.15, 0.38], stars: false, body: 'sun', radius: 4200 });
  addLights(scene, { sky: 0xffd2b0, ground: 0x4a3a5a, hemi: 1.25, dir: 0xffb27a, dirI: 1.6, dirPos: [-600, 220, -500] });

  // ground + city far below the course
  const gTex = tex.groundTexture();
  gTex.repeat.set(200, 200);
  const cx = (track.bounds.min.x + track.bounds.max.x) / 2;
  const cz = (track.bounds.min.z + track.bounds.max.z) / 2;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000), new THREE.MeshStandardMaterial({ map: gTex, color: 0x8a7a9a, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(cx, 0, cz);
  scene.add(ground);
  buildCity(scene, track, { avoidTrack: false, count: 520, margin: 700, maxH: 85, emissive: 0.55, attempts: 600 });

  // ring of low-poly mountains on the horizon
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x5a4a72, roughness: 1, flatShading: true });
  for (let i = 0; i < 46; i++) {
    const th = (i / 46) * Math.PI * 2 + Math.random() * 0.1;
    const r = 2900 + Math.random() * 500;
    const h = 260 + Math.random() * 420;
    const m = new THREE.Mesh(new THREE.ConeGeometry(220 + Math.random() * 260, h, 5 + (i % 3)), rockMat);
    m.position.set(cx + Math.cos(th) * r, h / 2 - 10, cz + Math.sin(th) * r);
    m.rotation.y = Math.random() * Math.PI;
    scene.add(m);
  }

  // clouds: soft sprites kept clear of the corridor so they never blind you
  const cloudTex = tex.radialTexture('rgba(255,236,232,0.95)', 'rgba(255,220,220,0)');
  const sparse = track.points.filter((_, i) => i % 8 === 0);
  let placed = 0;
  for (let k = 0; k < 900 && placed < 150; k++) {
    const x = track.bounds.min.x - 600 + Math.random() * (track.bounds.max.x - track.bounds.min.x + 1200);
    const z = track.bounds.min.z - 600 + Math.random() * (track.bounds.max.z - track.bounds.min.z + 1200);
    const y = 60 + Math.random() * 360;
    const size = 70 + Math.random() * 120;
    let ok = true;
    for (const p of sparse) {
      const dh = Math.hypot(p.x - x, p.z - z);
      if (dh < size * 0.6 + a + 25 && Math.abs(p.y - y) < size * 0.4 + b + 25) { ok = false; break; }
    }
    if (!ok) continue;
    const c = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.5 + Math.random() * 0.3, depthWrite: false }));
    c.scale.set(size * 1.6, size * 0.7, 1);
    c.position.set(x, y, z);
    scene.add(c);
    placed++;
  }

  // gate rings along the course, oriented to the 3D tangent
  const ringGeo = new THREE.TubeGeometry(new EllipseCurve3(a, b), 64, 0.7, 6, true);
  const every = 40;
  const n = Math.floor(track.count / every);
  const rings = new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true }), n);
  const amber = new THREE.Color(0xffb84d);
  const cyan = new THREE.Color(0x4fe3ff);
  const d = new THREE.Object3D();
  const target = new THREE.Vector3();
  for (let k = 0; k < n; k++) {
    const i = k * every;
    const p = track.points[i];
    d.position.copy(p);
    target.copy(p).add(track.tangents3[i]);
    d.lookAt(target);
    d.updateMatrix();
    rings.setMatrixAt(k, d.matrix);
    rings.setColorAt(k, k === 0 ? new THREE.Color(0xeef2ff) : k % 5 === 0 ? cyan : amber);
  }
  scene.add(rings);

  // start banner above the first gate
  const p0 = track.points[0];
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(track.width + 6, (track.width + 6) / 8), new THREE.MeshBasicMaterial({ map: tex.bannerTexture('SKYDRIVE X'), side: THREE.DoubleSide }));
  banner.position.set(p0.x, p0.y + b + 5, p0.z);
  banner.lookAt(target.copy(banner.position).sub(track.tangents[0]));
  scene.add(banner);

  return { sky, update() {} };
}
