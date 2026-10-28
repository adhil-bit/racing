import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as tex from './textures.js';

// Strip that follows the centreline. `edge(i)` returns two world points for
// sample i; UVs run across (u) and along (v) the strip.
export function ribbon(track, edge, vRepeat, material) {
  const N = track.count;
  const pos = new Float32Array((N + 1) * 6);
  const uv = new Float32Array((N + 1) * 4);
  const idx = [];
  for (let i = 0; i <= N; i++) {
    const [a, b] = edge(i % N);
    pos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
    const v = (i * track.segLen) / vRepeat;
    uv.set([0, v, 1, v], i * 4);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

export const off = (track, i, lateral, y) => {
  const p = track.points[i];
  const r = track.rights[i];
  return new THREE.Vector3(p.x + r.x * lateral, y, p.z + r.z * lateral);
};

// Sky dome + stars + moon/sun in one group. Game moves the group with the
// camera so the sky never clips, however far a plane flies.
export function buildSky(scene, { horizon, mid, top, stars = true, body = 'moon', radius = 2200 }) {
  const group = new THREE.Group();
  const v3 = (c) => new THREE.Vector3(...c);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uH: { value: v3(horizon) }, uM: { value: v3(mid) }, uT: { value: v3(top) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 uH; uniform vec3 uM; uniform vec3 uT; varying vec3 vP;
        void main(){
          float h = clamp(vP.y, -0.1, 1.0);
          vec3 c = mix(uH, uM, smoothstep(0.0, 0.18, h));
          c = mix(c, uT, smoothstep(0.18, 0.7, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  sky.renderOrder = -1;
  group.add(sky);
  if (stars) {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(1600 * 3);
    const R = radius * 0.9;
    for (let i = 0; i < 1600; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.random() * Math.PI * 0.42;
      p.set([Math.cos(th) * Math.sin(ph) * R, Math.cos(ph) * R, Math.sin(th) * Math.sin(ph) * R], i * 3);
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    group.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 1.6, sizeAttenuation: false, fog: false })));
  }
  const isSun = body === 'sun';
  const disc = new THREE.Sprite(new THREE.SpriteMaterial({
    map: isSun ? tex.radialTexture('rgba(255,236,190,1)', 'rgba(255,150,90,0)') : tex.radialTexture('rgba(235,240,255,1)', 'rgba(150,170,255,0)'),
    fog: false, depthWrite: false,
  }));
  const s = isSun ? radius * 0.28 : radius * 0.12;
  disc.scale.set(s, s, 1);
  disc.position.copy(isSun ? new THREE.Vector3(-0.75, 0.07, -0.65).normalize().multiplyScalar(radius * 0.85)
    : new THREE.Vector3(-0.45, 0.45, -0.7).normalize().multiplyScalar(radius * 0.85));
  group.add(disc);
  scene.add(group);
  return group;
}

export function addLights(scene, { sky = 0x9fb4ff, ground = 0x2a2035, hemi = 1.1, dir = 0xbfcaff, dirI = 1.1, dirPos = [-300, 500, -400] } = {}) {
  scene.add(new THREE.HemisphereLight(sky, ground, hemi));
  const d = new THREE.DirectionalLight(dir, dirI);
  d.position.set(...dirPos);
  scene.add(d);
}

// Merged city blocks (one draw call). The window texture doubles as emissive.
export function buildCity(scene, track, {
  count = 340, margin = 320, clearance = 30, minH = 16, varH = 40, nearH = 70,
  baseY = 0, emissive = 0.9, avoidTrack = true, attempts = 2400, maxH = Infinity,
} = {}) {
  const wTex = tex.windowTexture();
  const geos = [];
  const sparse = track.points.filter((_, i) => i % 4 === 0);
  const b = track.bounds;
  const minX = b.min.x - margin;
  const maxX = b.max.x + margin;
  const minZ = b.min.z - margin;
  const maxZ = b.max.z + margin;
  for (let a = 0; a < attempts && geos.length < count; a++) {
    const x = minX + Math.random() * (maxX - minX);
    const z = minZ + Math.random() * (maxZ - minZ);
    const w = 14 + Math.random() * 26;
    const d = 14 + Math.random() * 26;
    let closeness = 0.5;
    if (avoidTrack) {
      let nearest = Infinity;
      for (const p of sparse) {
        const dx = p.x - x;
        const dz = p.z - z;
        const q = dx * dx + dz * dz;
        if (q < nearest) nearest = q;
      }
      nearest = Math.sqrt(nearest);
      const need = clearance + Math.max(w, d) * 0.75;
      if (nearest < need) continue;
      closeness = THREE.MathUtils.clamp(1 - (nearest - need) / 260, 0, 1);
    } else closeness = Math.random();
    const h = Math.min(maxH, minH + Math.random() * varH + closeness * Math.random() * nearH);
    const g = new THREE.BoxGeometry(w, h - baseY, d);
    const uvs = g.attributes.uv;
    for (let f = 0; f < 6; f++) {
      const faceW = f < 2 ? d : w;
      for (let v = 0; v < 4; v++) {
        const k = f * 4 + v;
        if (f === 2 || f === 3) uvs.setXY(k, 0.002, 0.002);
        else uvs.setXY(k, uvs.getX(k) * Math.max(1, Math.round(faceW / 12)), uvs.getY(k) * Math.max(1, Math.round(h / 22)));
      }
    }
    g.rotateY(Math.random() * Math.PI);
    g.translate(x, baseY + (h - baseY) / 2, z);
    geos.push(g);
  }
  const city = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({
    map: wTex, emissiveMap: wTex, emissive: 0xffffff, emissiveIntensity: emissive, roughness: 0.8, metalness: 0.2,
  }));
  scene.add(city);
  return city;
}

// Start/finish gantry spanning the course at sample 0.
export function buildGantry(scene, track, { span, y = 0, height = 11, pillarDown = 0 }) {
  const p0 = track.points[0];
  const t0 = track.tangents[0];
  const g = new THREE.Group();
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x2c3352, metalness: 0.6, roughness: 0.4 });
  const ph = height + pillarDown;
  for (const s of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.2, ph, 1.2), pillarMat);
    pillar.position.set(s * (span / 2 + 0.6), height - ph / 2, 0);
    g.add(pillar);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(span + 2.4, 2.6, 1), new THREE.MeshBasicMaterial({ map: tex.bannerTexture('SKYDRIVE X') }));
  beam.position.y = height;
  g.add(beam);
  g.position.set(p0.x, y, p0.z);
  g.rotation.y = Math.atan2(t0.x, t0.z);
  scene.add(g);
  return g;
}
