import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TRACK } from '../config.js';
import * as tex from './textures.js';

// Builds a strip that follows the centreline. `edge(i)` returns two world
// points for sample i; the strip is UV-mapped across (u) and along (v).
function ribbon(track, edge, vRepeat, material) {
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

const off = (track, i, lateral, y) => {
  const p = track.points[i];
  const r = track.rights[i];
  return new THREE.Vector3(p.x + r.x * lateral, y, p.z + r.z * lateral);
};

export function buildEnvironment(scene, track) {
  const half = TRACK.width / 2;
  const wallLat = half + TRACK.wallOffset;

  // --- sky, fog, light -------------------------------------------------
  scene.fog = new THREE.Fog(0x1a2246, 160, 1100);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(2200, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {},
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP;
        void main(){
          float h = clamp(vP.y, -0.1, 1.0);
          vec3 horizon = vec3(0.36, 0.22, 0.42);
          vec3 mid = vec3(0.10, 0.13, 0.30);
          vec3 top = vec3(0.03, 0.05, 0.14);
          vec3 c = mix(horizon, mid, smoothstep(0.0, 0.18, h));
          c = mix(c, top, smoothstep(0.18, 0.7, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  sky.renderOrder = -1;
  scene.add(sky);

  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(1600 * 3);
  for (let i = 0; i < 1600; i++) {
    const th = Math.random() * Math.PI * 2;
    const ph = Math.random() * Math.PI * 0.42;
    starPos.set([Math.cos(th) * Math.sin(ph) * 2000, Math.cos(ph) * 2000, Math.sin(th) * Math.sin(ph) * 2000], i * 3);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 1.6, sizeAttenuation: false, fog: false })));

  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.radialTexture('rgba(235,240,255,1)', 'rgba(150,170,255,0)'), fog: false, depthWrite: false }));
  moon.scale.set(260, 260, 1);
  moon.position.set(-900, 900, -1400);
  scene.add(moon);

  scene.add(new THREE.HemisphereLight(0x9fb4ff, 0x2a2035, 1.1));
  const moonLight = new THREE.DirectionalLight(0xbfcaff, 1.1);
  moonLight.position.set(-300, 500, -400);
  scene.add(moonLight);

  // --- ground ------------------------------------------------------------
  const gTex = tex.groundTexture();
  gTex.repeat.set(120, 120);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ map: gTex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(track.bounds.min.x + 500, -0.05, track.bounds.min.z + 450);
  scene.add(ground);

  // --- road, curbs, walls ---------------------------------------------------
  const road = ribbon(track, (i) => [off(track, i, -half, 0.02), off(track, i, half, 0.02)], 24,
    new THREE.MeshStandardMaterial({ map: tex.roadTexture(), roughness: 0.82, metalness: 0.05, side: THREE.DoubleSide }));
  scene.add(road);

  const curbMat = new THREE.MeshStandardMaterial({ map: tex.curbTexture(), roughness: 0.7, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    scene.add(ribbon(track, (i) => [off(track, i, s * half, 0.035), off(track, i, s * (half + TRACK.curbWidth), 0.035)], 6, curbMat));
  }
  const wallMat = new THREE.MeshStandardMaterial({ map: tex.wallTexture(), roughness: 0.6, side: THREE.DoubleSide });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x4fe3ff, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    scene.add(ribbon(track, (i) => [off(track, i, s * wallLat, 0), off(track, i, s * wallLat, TRACK.wallHeight)], 8, wallMat));
    scene.add(ribbon(track, (i) => [off(track, i, s * wallLat, TRACK.wallHeight), off(track, i, s * (wallLat + 0.25), TRACK.wallHeight)], 8, glowMat));
    // run-off apron between curb and wall
    scene.add(ribbon(track, (i) => [off(track, i, s * (half + TRACK.curbWidth), 0.015), off(track, i, s * wallLat, 0.015)], 8,
      new THREE.MeshStandardMaterial({ color: 0x252a3d, roughness: 1, side: THREE.DoubleSide })));
  }

  // --- start / finish ------------------------------------------------------
  const p0 = track.points[0];
  const t0 = track.tangents[0];
  const heading = Math.atan2(t0.x, t0.z);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(TRACK.width, 3), new THREE.MeshStandardMaterial({ map: tex.checkerTexture(), roughness: 0.8 }));
  line.rotation.set(-Math.PI / 2, 0, heading);
  line.position.set(p0.x, 0.045, p0.z);
  // PlaneGeometry lies in XY; after -90° X it lies in XZ with width on X.
  line.rotation.order = 'YXZ';
  line.rotation.set(-Math.PI / 2, heading, 0);
  scene.add(line);

  const gantry = new THREE.Group();
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x2c3352, metalness: 0.6, roughness: 0.4 });
  for (const s of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 11, 1.2), pillarMat);
    pillar.position.set(s * (wallLat + 1), 5.5, 0);
    gantry.add(pillar);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(wallLat * 2 + 3.2, 2.6, 1), new THREE.MeshBasicMaterial({ map: tex.bannerTexture('APEX RUSH') }));
  beam.position.y = 11;
  gantry.add(beam);
  gantry.position.copy(p0);
  gantry.rotation.y = heading;
  scene.add(gantry);

  // --- street lamps + light pools (instanced: 3 draw calls total) ------------
  const lampEvery = 26;
  const lampCount = Math.floor(track.count / lampEvery);
  const poleGeo = new THREE.CylinderGeometry(0.14, 0.2, 10, 6);
  const armGeo = new THREE.BoxGeometry(3.6, 0.2, 0.3);
  const headGeo = new THREE.BoxGeometry(1.4, 0.3, 0.7);
  const poolGeo = new THREE.PlaneGeometry(1, 1);
  const poles = new THREE.InstancedMesh(poleGeo, pillarMat, lampCount);
  const arms = new THREE.InstancedMesh(armGeo, pillarMat, lampCount);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: 0xffd08a }), lampCount);
  const pools = new THREE.InstancedMesh(poolGeo, new THREE.MeshBasicMaterial({
    map: tex.radialTexture('rgba(255,190,110,0.55)', 'rgba(255,170,80,0)'),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }), lampCount);
  const d = new THREE.Object3D();
  for (let k = 0; k < lampCount; k++) {
    const i = k * lampEvery;
    const side = k % 2 ? 1 : -1;
    const p = track.points[i];
    const r = track.rights[i];
    const t = track.tangents[i];
    const yaw = Math.atan2(t.x, t.z);
    const lat = side * (wallLat + 1.2);
    const base = new THREE.Vector3(p.x + r.x * lat, 0, p.z + r.z * lat);
    d.position.set(base.x, 5, base.z); d.rotation.set(0, yaw, 0); d.scale.set(1, 1, 1); d.updateMatrix();
    poles.setMatrixAt(k, d.matrix);
    const inward = -side * 1.7;
    d.position.set(base.x + r.x * inward, 9.9, base.z + r.z * inward); d.updateMatrix();
    arms.setMatrixAt(k, d.matrix);
    const hl = -side * 3.2;
    d.position.set(base.x + r.x * hl, 9.7, base.z + r.z * hl); d.updateMatrix();
    heads.setMatrixAt(k, d.matrix);
    const pl = side * (half - 4);
    d.position.set(p.x + r.x * pl, 0.06, p.z + r.z * pl); d.rotation.set(-Math.PI / 2, 0, 0); d.scale.set(22, 22, 1); d.updateMatrix();
    pools.setMatrixAt(k, d.matrix);
  }
  scene.add(poles, arms, heads, pools);

  // --- city blocks: one merged mesh, window texture used as emissive -------
  const wTex = windowTexture();
  const geos = [];
  const sparse = track.points.filter((_, i) => i % 4 === 0);
  const minX = track.bounds.min.x - 320;
  const maxX = track.bounds.max.x + 320;
  const minZ = track.bounds.min.z - 320;
  const maxZ = track.bounds.max.z + 320;
  let placed = 0;
  for (let attempt = 0; attempt < 2400 && placed < 340; attempt++) {
    const x = minX + Math.random() * (maxX - minX);
    const z = minZ + Math.random() * (maxZ - minZ);
    const w = 14 + Math.random() * 26;
    const dd = 14 + Math.random() * 26;
    let nearest = Infinity;
    for (const p of sparse) {
      const dx = p.x - x;
      const dz = p.z - z;
      const q = dx * dx + dz * dz;
      if (q < nearest) nearest = q;
    }
    nearest = Math.sqrt(nearest);
    const clearance = wallLat + 10 + Math.max(w, dd) * 0.75;
    if (nearest < clearance) continue;
    const closeness = THREE.MathUtils.clamp(1 - (nearest - clearance) / 260, 0, 1);
    const h = 16 + Math.random() * 40 + closeness * Math.random() * 70;
    const g = new THREE.BoxGeometry(w, h, dd);
    const uvs = g.attributes.uv;
    for (let f = 0; f < 6; f++) {
      const faceW = f < 2 ? dd : w;
      for (let v = 0; v < 4; v++) {
        const k = f * 4 + v;
        if (f === 2 || f === 3) uvs.setXY(k, 0.002, 0.002);
        else uvs.setXY(k, uvs.getX(k) * Math.max(1, Math.round(faceW / 12)), uvs.getY(k) * Math.max(1, Math.round(h / 22)));
      }
    }
    g.rotateY(Math.random() * Math.PI);
    g.translate(x, h / 2, z);
    geos.push(g);
    placed++;
  }
  const city = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({
    map: wTex, emissiveMap: wTex, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.8, metalness: 0.2,
  }));
  scene.add(city);

  return { city };
}

function windowTexture() {
  return tex.windowTexture();
}
