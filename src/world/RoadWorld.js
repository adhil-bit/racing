import * as THREE from 'three';
import * as tex from './textures.js';
import { ribbon, off, buildSky, addLights, buildCity, buildGantry } from './common.js';

export function buildRoadWorld(scene, track) {
  const half = track.width / 2;
  const wallLat = half + track.wallOffset;

  scene.fog = new THREE.Fog(0x1a2246, 160, 1100);
  const sky = buildSky(scene, { horizon: [0.36, 0.22, 0.42], mid: [0.10, 0.13, 0.30], top: [0.03, 0.05, 0.14] });
  addLights(scene);

  const gTex = tex.groundTexture();
  gTex.repeat.set(120, 120);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ map: gTex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(track.bounds.min.x + 500, -0.05, track.bounds.min.z + 450);
  scene.add(ground);

  scene.add(ribbon(track, (i) => [off(track, i, -half, 0.02), off(track, i, half, 0.02)], 24,
    new THREE.MeshStandardMaterial({ map: tex.roadTexture(), roughness: 0.82, metalness: 0.05, side: THREE.DoubleSide })));
  const curbMat = new THREE.MeshStandardMaterial({ map: tex.curbTexture(), roughness: 0.7, side: THREE.DoubleSide });
  const wallMat = new THREE.MeshStandardMaterial({ map: tex.wallTexture(), roughness: 0.6, side: THREE.DoubleSide });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x4fe3ff, side: THREE.DoubleSide });
  const apronMat = new THREE.MeshStandardMaterial({ color: 0x252a3d, roughness: 1, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    scene.add(ribbon(track, (i) => [off(track, i, s * half, 0.035), off(track, i, s * (half + track.curbWidth), 0.035)], 6, curbMat));
    scene.add(ribbon(track, (i) => [off(track, i, s * wallLat, 0), off(track, i, s * wallLat, track.wallHeight)], 8, wallMat));
    scene.add(ribbon(track, (i) => [off(track, i, s * wallLat, track.wallHeight), off(track, i, s * (wallLat + 0.25), track.wallHeight)], 8, glowMat));
    scene.add(ribbon(track, (i) => [off(track, i, s * (half + track.curbWidth), 0.015), off(track, i, s * wallLat, 0.015)], 8, apronMat));
  }

  const p0 = track.points[0];
  const heading = Math.atan2(track.tangents[0].x, track.tangents[0].z);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(track.width, 3), new THREE.MeshStandardMaterial({ map: tex.checkerTexture(), roughness: 0.8 }));
  line.rotation.order = 'YXZ';
  line.rotation.set(-Math.PI / 2, heading, 0);
  line.position.set(p0.x, 0.045, p0.z);
  scene.add(line);
  buildGantry(scene, track, { span: wallLat * 2 + 2 });

  // street lamps + light pools (instanced)
  const lampEvery = 26;
  const n = Math.floor(track.count / lampEvery);
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x2c3352, metalness: 0.6, roughness: 0.4 });
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.2, 10, 6), pillarMat, n);
  const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(3.6, 0.2, 0.3), pillarMat, n);
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 0.3, 0.7), new THREE.MeshBasicMaterial({ color: 0xffd08a }), n);
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    map: tex.radialTexture('rgba(255,190,110,0.55)', 'rgba(255,170,80,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }), n);
  const d = new THREE.Object3D();
  for (let k = 0; k < n; k++) {
    const i = k * lampEvery;
    const side = k % 2 ? 1 : -1;
    const p = track.points[i];
    const r = track.rights[i];
    const t = track.tangents[i];
    const yaw = Math.atan2(t.x, t.z);
    const lat = side * (wallLat + 1.2);
    const bx = p.x + r.x * lat;
    const bz = p.z + r.z * lat;
    d.scale.set(1, 1, 1);
    d.rotation.set(0, yaw, 0);
    d.position.set(bx, 5, bz); d.updateMatrix(); poles.setMatrixAt(k, d.matrix);
    d.position.set(bx - r.x * side * 1.7, 9.9, bz - r.z * side * 1.7); d.updateMatrix(); arms.setMatrixAt(k, d.matrix);
    d.position.set(bx - r.x * side * 3.2, 9.7, bz - r.z * side * 3.2); d.updateMatrix(); heads.setMatrixAt(k, d.matrix);
    const pl = side * (half - 4);
    d.position.set(p.x + r.x * pl, 0.06, p.z + r.z * pl); d.rotation.set(-Math.PI / 2, 0, 0); d.scale.set(22, 22, 1); d.updateMatrix();
    pools.setMatrixAt(k, d.matrix);
  }
  scene.add(poles, arms, heads, pools);

  buildCity(scene, track, { clearance: wallLat + 10 });
  return { sky, update() {} };
}
