import * as THREE from 'three';
import { radialTexture } from '../world/textures.js';

// Procedural low-poly models. Every model faces +Z and returns the same
// handle shape so physics/AI code never cares whether it drives a car or bike:
// { root, tilt, wheels[], steerPivots[], flames[], brakeMat, kind }

let shadowTex;
function blobShadow(w, l) {
  shadowTex ||= radialTexture('rgba(0,0,0,0.75)', 'rgba(0,0,0,0)');
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.06;
  return m;
}

// Metallic paint needs something to reflect; Game sets a PMREM environment.
let envMap = null;
export function setVehicleEnvironment(tex) {
  envMap = tex;
  for (const m of [darkMat, glassMat, rimMat]) { m.envMap = tex; m.envMapIntensity = 0.5; m.needsUpdate = true; }
}
function paint(color) {
  return new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.3, envMap, envMapIntensity: 0.9 });
}
const darkMat = new THREE.MeshStandardMaterial({ color: 0x1c2030, metalness: 0.4, roughness: 0.6 });
const glassMat = new THREE.MeshStandardMaterial({ color: 0x0f1a33, metalness: 0.9, roughness: 0.1 });
const tyreMat = new THREE.MeshStandardMaterial({ color: 0x15171f, roughness: 0.9 });
const rimMat = new THREE.MeshStandardMaterial({ color: 0xb8c0d8, metalness: 0.9, roughness: 0.25 });
const headMat = new THREE.MeshBasicMaterial({ color: 0xf4f7ff });

function wheel(radius, width) {
  const spin = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 18), tyreMat);
  tyre.rotation.z = Math.PI / 2;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, width * 1.04, 6), rimMat);
  rim.rotation.z = Math.PI / 2;
  spin.add(tyre, rim);
  spin.userData.radius = radius;
  return spin;
}

function flame() {
  const m = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 1.1, 10),
    new THREE.MeshBasicMaterial({ color: 0x4fe3ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.visible = false;
  return m;
}

export function buildCar(color, variant = 'gt') {
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  root.add(tilt, blobShadow(3.2, 6));
  const body = paint(color);
  const muscle = variant === 'muscle';

  const lower = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 4.5), body);
  lower.position.y = 0.6;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.28, 1.1), body);
  nose.position.set(0, 0.95, 1.45);
  nose.rotation.x = muscle ? 0.02 : 0.12;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, muscle ? 1.8 : 2.0), glassMat);
  cabin.position.set(0, 1.08, muscle ? -0.35 : -0.25);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, muscle ? 1.5 : 1.6), body);
  roof.position.set(0, 1.36, cabin.position.z - 0.05);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.18, 4.1), darkMat);
  skirt.position.y = 0.34;
  tilt.add(lower, nose, cabin, roof, skirt);

  if (muscle) {
    const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.9), darkMat);
    scoop.position.set(0, 1.13, 1.3);
    tilt.add(scoop);
    for (const s of [-0.3, 0.3]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 4.4), new THREE.MeshStandardMaterial({ color: 0xeef2ff, roughness: 0.4 }));
      stripe.position.set(s, 0.86, 0);
      tilt.add(stripe);
    }
  } else {
    for (const s of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.2), darkMat);
      strut.position.set(s * 0.6, 1.0, -2.0);
      tilt.add(strut);
    }
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.06, 0.45), body);
    wing.position.set(0, 1.2, -2.05);
    tilt.add(wing);
  }

  for (const s of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.1, 0.05), headMat);
    hl.position.set(s * 0.68, 0.75, 2.26);
    tilt.add(hl);
  }
  const brakeMat = new THREE.MeshBasicMaterial({ color: 0x8a1020 });
  const tail = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.05), brakeMat);
  tail.position.set(0, 0.8, -2.26);
  tilt.add(tail);

  const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 4.8), new THREE.MeshBasicMaterial({
    map: radialTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)'), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.08;
  root.add(glow);

  const wheels = [];
  const steerPivots = [];
  for (const [x, z, front] of [[-0.98, 1.4, 1], [0.98, 1.4, 1], [-0.98, -1.45, 0], [0.98, -1.45, 0]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.4, z);
    const w = wheel(0.4, muscle ? 0.4 : 0.34);
    pivot.add(w);
    root.add(pivot);
    wheels.push(w);
    if (front) steerPivots.push(pivot);
  }
  const flames = [];
  for (const x of [-0.45, 0.45]) {
    const f = flame();
    f.position.set(x, 0.45, -2.85);
    root.add(f);
    flames.push(f);
  }
  return { root, tilt, wheels, steerPivots, flames, brakeMat, kind: 'car' };
}

export function buildBike(color, variant = 'super') {
  const root = new THREE.Group();
  const tilt = new THREE.Group(); // lean group: rolls around the contact line
  root.add(tilt, blobShadow(1.4, 3.2));
  const body = paint(color);
  const naked = variant === 'naked';

  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.4, 1.3), darkMat);
  frame.position.set(0, 0.62, 0);
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.7), body);
  tank.position.set(0, 0.98, 0.2);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.6), darkMat);
  seat.position.set(0, 0.98, -0.42);
  const tailPiece = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.5), body);
  tailPiece.position.set(0, 1.06, -0.82);
  tailPiece.rotation.x = -0.25;
  tilt.add(frame, tank, seat, tailPiece);
  if (!naked) {
    const fairing = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.52, 0.65), body);
    fairing.position.set(0, 0.86, 0.75);
    fairing.rotation.x = -0.35;
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.32), glassMat);
    screen.position.set(0, 1.18, 0.82);
    screen.rotation.x = -0.6;
    tilt.add(fairing, screen);
  }
  const fork = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.1), rimMat);
  fork.position.set(0, 0.62, 0.92);
  fork.rotation.x = 0.4;
  tilt.add(fork);

  // rider in a race tuck
  const suit = new THREE.MeshStandardMaterial({ color: 0x232a44, roughness: 0.7 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.3, 0.75), suit);
  torso.position.set(0, 1.32, -0.12);
  torso.rotation.x = 0.55;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), body);
  helmet.position.set(0, 1.5, 0.32);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, 0, 1.2), glassMat);
  visor.position.set(0, 1.5, 0.39);
  visor.rotation.x = 1.4;
  tilt.add(torso, helmet, visor);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.55), suit);
    arm.position.set(s * 0.25, 1.2, 0.42);
    arm.rotation.x = 0.5;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.6), suit);
    leg.position.set(s * 0.24, 0.92, -0.42);
    leg.rotation.x = -0.6;
    tilt.add(arm, leg);
  }

  const hl = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.05), headMat);
  hl.position.set(0, 0.92, 1.1);
  const brakeMat = new THREE.MeshBasicMaterial({ color: 0x8a1020 });
  const tl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.04), brakeMat);
  tl.position.set(0, 1.08, -1.08);
  tilt.add(hl, tl);

  const wheels = [];
  const steerPivots = [];
  for (const [z, front] of [[1.05, 1], [-0.85, 0]]) {
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.34, z);
    const w = wheel(0.34, 0.16);
    pivot.add(w);
    tilt.add(pivot);
    wheels.push(w);
    if (front) steerPivots.push(pivot);
  }
  const f = flame();
  f.position.set(0.18, 0.62, -1.5);
  f.scale.setScalar(0.8);
  tilt.add(f);
  return { root, tilt, wheels, steerPivots, flames: [f], brakeMat, kind: 'bike' };
}

export function buildModel(spec, color) {
  if (spec.kind === 'bike') return buildBike(color, spec.id === 'shade' ? 'naked' : 'super');
  return buildCar(color, spec.id === 'atlas' ? 'muscle' : 'gt');
}

// Shared per-frame animation for player and AI.
// lean: radians (bikes roll, cars get a small body roll in the opposite sense)
export function animateModel(m, { dt, speed, steer, lean, pitch = 0, nitro, braking }) {
  for (const w of m.wheels) w.rotation.x += (speed * dt) / w.userData.radius;
  for (const p of m.steerPivots) p.rotation.y = -steer * (m.kind === 'bike' ? 0.25 : 0.45);
  if (m.kind === 'bike') {
    m.tilt.rotation.z = lean;
    m.tilt.rotation.x = pitch;
  } else {
    m.tilt.rotation.z = -lean * 0.12;
    m.tilt.rotation.x = pitch * 0.5;
  }
  for (const f of m.flames) {
    f.visible = nitro;
    if (nitro) f.scale.set(1, 0.8 + Math.random() * 0.8, 1);
  }
  m.brakeMat.color.setHex(braking ? 0xff2a40 : 0x8a1020);
}
