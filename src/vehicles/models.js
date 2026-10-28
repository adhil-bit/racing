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
  for (const m of [darkMat, glassMat, rimMat, dishMat]) { m.envMap = tex; m.envMapIntensity = 0.5; m.needsUpdate = true; }
}
function paint(color) {
  return new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.3, envMap, envMapIntensity: 0.9 });
}
const darkMat = new THREE.MeshStandardMaterial({ color: 0x1c2030, metalness: 0.4, roughness: 0.6 });
const glassMat = new THREE.MeshStandardMaterial({ color: 0x0f1a33, metalness: 0.9, roughness: 0.1 });
const tyreMat = new THREE.MeshStandardMaterial({ color: 0x15171f, roughness: 0.9 });
const rimMat = new THREE.MeshStandardMaterial({ color: 0xb8c0d8, metalness: 0.9, roughness: 0.25 });
const headMat = new THREE.MeshBasicMaterial({ color: 0xf4f7ff });

const dishMat = new THREE.MeshStandardMaterial({ color: 0x2a3048, metalness: 0.8, roughness: 0.35 });
function wheel(radius, width) {
  const spin = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 24), tyreMat);
  tyre.rotation.z = Math.PI / 2;
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.68, radius * 0.68, width * 1.02, 20), dishMat);
  dish.rotation.z = Math.PI / 2;
  spin.add(tyre, dish);
  // five spokes + hub, so rotation reads clearly at speed
  const spokeGeo = new THREE.BoxGeometry(width * 1.08, radius * 0.2, radius * 0.56);
  for (let k = 0; k < 5; k++) {
    const sp = new THREE.Mesh(spokeGeo, rimMat);
    sp.rotation.x = (k / 5) * Math.PI * 2;
    sp.position.set(0, -Math.sin(sp.rotation.x) * radius * 0.42, Math.cos(sp.rotation.x) * radius * 0.42);
    spin.add(sp);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.16, radius * 0.16, width * 1.12, 10), rimMat);
  hub.rotation.z = Math.PI / 2;
  spin.add(hub);
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

// Side profile (z = length, y = height) extruded across the width with a bevel,
// so bodies get rounded edges and real wheel-arch cut-outs instead of boxes.
function profileMesh(points, arches, width, mat, bevel = 0.12) {
  const s = new THREE.Shape();
  const [first, ...rest] = points;
  s.moveTo(first[0], first[1]);
  for (const p of rest) {
    if (p === 'ARCHES') {
      // bottom edge runs rear -> front, hopping over each wheel
      for (const [cz, cy, r] of arches) {
        s.lineTo(cz - r, cy);
        s.absarc(cz, cy, r, Math.PI, 0, true);
      }
    } else s.lineTo(p[0], p[1]);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth: width, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 4, curveSegments: 18,
  });
  g.translate(0, 0, -width / 2);
  g.rotateY(-Math.PI / 2); // shape x -> world z (forward), extrusion -> world x
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

function box(w, h, d, mat, x, y, z, rx = 0, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, 0);
  return m;
}

const CAR_SHAPES = {
  // low wedge supercar: sharp nose, cab-forward glasshouse, ducktail
  gt: {
    wheelZ: [1.38, -1.42], wheelR: 0.4, tyreW: 0.34, track: 0.98, width: 1.62,
    body: [[-2.2, 0.3], 'ARCHES', [2.05, 0.3], [2.32, 0.4], [2.28, 0.55], [1.7, 0.68], [0.75, 0.86], [-1.5, 0.94], [-2.2, 1.0], [-2.32, 0.62]],
    cabin: [[0.85, 0.82], [0.05, 1.28], [-0.6, 1.3], [-1.65, 0.92], [0.85, 0.82]],
    cabinW: 1.2,
  },
  // long-hood muscle coupe: tall blunt nose, upright screen, short deck
  muscle: {
    wheelZ: [1.45, -1.4], wheelR: 0.42, tyreW: 0.42, track: 1.0, width: 1.72,
    body: [[-2.3, 0.32], 'ARCHES', [2.25, 0.32], [2.38, 0.42], [2.38, 0.86], [2.2, 0.92], [0.45, 0.98], [-1.55, 1.0], [-2.3, 1.02], [-2.4, 0.9], [-2.4, 0.45]],
    cabin: [[0.4, 0.95], [-0.2, 1.44], [-0.95, 1.45], [-1.5, 0.98], [0.4, 0.95]],
    cabinW: 1.36,
  },
};

export function buildCar(color, variant = 'gt') {
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  root.add(tilt, blobShadow(3.2, 6));
  const body = paint(color);
  const muscle = variant === 'muscle';
  const S = CAR_SHAPES[muscle ? 'muscle' : 'gt'];
  const arches = S.wheelZ.slice().reverse().map((z) => [z, S.wheelR, S.wheelR + 0.1]);
  // arches must be listed rear -> front along the bottom edge
  arches.sort((a, b) => a[0] - b[0]);

  tilt.add(profileMesh(S.body, arches, S.width, body, 0.14));
  const cabin = profileMesh(S.cabin, [], S.cabinW, glassMat, 0.1);
  tilt.add(cabin);
  // roof skin in body colour so the car doesn't read as a glass bubble
  const roofPts = muscle
    ? [[-0.12, 1.55], [-1.02, 1.56], [-1.05, 1.47], [-0.1, 1.46]]
    : [[0.05, 1.4], [-0.72, 1.39], [-0.78, 1.32], [0.05, 1.33]];
  tilt.add(profileMesh(roofPts, [], S.cabinW + 0.02, body, 0.06));

  // dark lower trim: splitter, side skirts, diffuser
  tilt.add(box(S.width + 0.2, 0.06, 0.5, darkMat, 0, 0.3, muscle ? 2.25 : 2.1));
  for (const sx of [-1, 1]) tilt.add(box(0.12, 0.12, 1.6, darkMat, sx * (S.width / 2 + 0.12), 0.38, 0));
  tilt.add(box(S.width, 0.22, 0.25, darkMat, 0, 0.42, muscle ? -2.3 : -2.22));

  // mirrors
  for (const sx of [-1, 1]) tilt.add(box(0.22, 0.12, 0.16, body, sx * (S.cabinW / 2 + 0.22), muscle ? 1.08 : 0.98, muscle ? 0.25 : 0.55));

  const brakeMat = new THREE.MeshBasicMaterial({ color: 0x8a1020 });
  if (muscle) {
    // grille with twin round lamps each side
    tilt.add(box(1.5, 0.34, 0.06, darkMat, 0, 0.66, 2.42));
    for (const sx of [-1, 1]) {
      for (const off of [0.48, 0.72]) {
        const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 14), headMat);
        lamp.rotation.x = Math.PI / 2;
        lamp.position.set(sx * off, 0.68, 2.45);
        tilt.add(lamp);
      }
    }
    // power bulge + scoop on the hood
    tilt.add(box(0.7, 0.1, 1.5, body, 0, 1.02, 1.3));
    tilt.add(box(0.45, 0.16, 0.4, darkMat, 0, 1.1, 1.05));
    // racing stripes laid along the hood and deck
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xeef2ff, roughness: 0.4 });
    for (const sx of [-0.22, 0.22]) {
      tilt.add(box(0.16, 0.02, 1.4, stripeMat, sx, 1.085, 1.62));
      tilt.add(box(0.16, 0.02, 0.75, stripeMat, sx, 1.06, -1.95));
    }
    // ducktail lip + wide tail lamps
    tilt.add(box(S.width + 0.1, 0.06, 0.25, body, 0, 1.08, -2.28, -0.25));
    for (const sx of [-1, 1]) tilt.add(box(0.62, 0.14, 0.05, brakeMat, sx * 0.5, 0.82, -2.47));
  } else {
    // slim angled headlights on the nose
    for (const sx of [-1, 1]) tilt.add(box(0.5, 0.05, 0.18, headMat, sx * 0.6, 0.62, 2.15, 0.25, sx * -0.2));
    // side intakes behind the doors
    for (const sx of [-1, 1]) tilt.add(box(0.06, 0.22, 0.55, darkMat, sx * (S.width / 2 + 0.15), 0.68, -0.55));
    // full-width LED tail bar
    tilt.add(box(1.7, 0.06, 0.05, brakeMat, 0, 0.88, -2.37));
    // swan-neck wing
    for (const sx of [-1, 1]) tilt.add(box(0.06, 0.32, 0.18, darkMat, sx * 0.55, 1.15, -1.95, 0.35));
    tilt.add(box(1.85, 0.05, 0.4, body, 0, 1.32, -2.05, -0.08));
    for (const sx of [-1, 1]) tilt.add(box(0.04, 0.2, 0.42, darkMat, sx * 0.93, 1.28, -2.05));
  }

  const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 4.8), new THREE.MeshBasicMaterial({
    map: radialTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)'), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.08;
  root.add(glow);

  const wheels = [];
  const steerPivots = [];
  for (const [i, z] of S.wheelZ.entries()) {
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * S.track, S.wheelR, z);
      const w = wheel(S.wheelR, S.tyreW);
      pivot.add(w);
      root.add(pivot);
      wheels.push(w);
      if (i === 0) steerPivots.push(pivot);
    }
  }
  const flames = [];
  for (const x of [-0.45, 0.45]) {
    const f = flame();
    f.position.set(x, 0.45, muscle ? -2.95 : -2.85);
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

// Plan-view outline (x, z) extruded upward into a thin slab: wings, tailplanes.
function planform(points, thickness, mat) {
  const sh = new THREE.Shape();
  points.forEach(([x, z], i) => (i ? sh.lineTo(x, -z) : sh.moveTo(x, -z)));
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: thickness, bevelEnabled: true, bevelThickness: thickness * 0.3, bevelSize: thickness * 0.3, bevelSegments: 2 });
  g.translate(0, 0, -thickness / 2);
  g.rotateX(-Math.PI / 2); // shape (x, -z) -> world (x, z); extrusion -> world y
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

function navLights(group, x, y, z) {
  group.add(box(0.12, 0.12, 0.12, new THREE.MeshBasicMaterial({ color: 0xff3355 }), -x, y, z));
  group.add(box(0.12, 0.12, 0.12, new THREE.MeshBasicMaterial({ color: 0x18c99a }), x, y, z));
}

const whiteMat = new THREE.MeshStandardMaterial({ color: 0xeef2ff, roughness: 0.4 });
const suitMat = new THREE.MeshStandardMaterial({ color: 0x232a44, roughness: 0.7 });

// Offshore racing catamaran. Waterline is y = 0; origin at mid-hull.
export function buildBoat(color) {
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  root.add(tilt);
  const body = paint(color);
  for (const sx of [-0.85, 0.85]) {
    const hull = profileMesh([[-4.0, -0.25], [3.0, -0.25], [4.3, 0.35], [4.2, 0.7], [-4.1, 0.7]], [], 0.5, darkMat, 0.1);
    hull.position.x = sx;
    tilt.add(hull);
  }
  tilt.add(profileMesh([[-4.1, 0.55], [3.4, 0.55], [4.15, 0.75], [2.6, 1.05], [0.4, 1.15], [-4.0, 1.1]], [], 1.85, body, 0.12));
  tilt.add(profileMesh([[1.3, 1.08], [0.3, 1.75], [-1.2, 1.78], [-1.7, 1.12]], [], 1.1, glassMat, 0.08));
  for (const sx of [-1, 1]) tilt.add(box(0.05, 0.14, 6.4, whiteMat, sx * 1.07, 0.82, -0.2));
  tilt.add(box(1.6, 0.1, 0.7, whiteMat, 0, 1.33, -3.2)); // aerofoil on the deck
  navLights(tilt, 1.0, 1.0, 1.4);
  const brakeMat = new THREE.MeshBasicMaterial({ color: 0x8a1020 });
  tilt.add(box(1.4, 0.08, 0.05, brakeMat, 0, 1.05, -4.25));
  // twin outboards on steering pivots
  const steerPivots = [];
  for (const sx of [-0.6, 0.6]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx, 0.4, -4.25);
    pivot.add(box(0.42, 1.1, 0.55, darkMat, 0, 0.35, -0.25));
    pivot.add(box(0.44, 0.35, 0.6, body, 0, 0.95, -0.25));
    tilt.add(pivot);
    steerPivots.push(pivot);
  }
  const flames = [];
  for (const x of [-0.6, 0.6]) {
    const f = flame();
    f.position.set(x, 0.55, -5.0);
    tilt.add(f);
    flames.push(f);
  }
  return { root, tilt, wheels: [], steerPivots, flames, brakeMat, kind: 'boat' };
}

// Sit-down jet ski with rider; leans into turns like a bike.
export function buildJetski(color) {
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  root.add(tilt);
  const body = paint(color);
  tilt.add(profileMesh([[-1.5, -0.2], [1.0, -0.2], [1.6, 0.25], [1.35, 0.55], [0.2, 0.62], [-1.5, 0.5]], [], 0.72, body, 0.1));
  tilt.add(box(0.36, 0.18, 0.95, darkMat, 0, 0.74, -0.45));
  tilt.add(box(0.62, 0.28, 0.42, body, 0, 0.78, 0.55, -0.4));
  tilt.add(box(0.8, 0.05, 0.3, whiteMat, 0, 0.42, -1.3));
  const bars = new THREE.Group();
  bars.position.set(0, 1.0, 0.4);
  bars.add(box(0.85, 0.06, 0.06, darkMat, 0, 0, 0));
  bars.add(box(0.08, 0.3, 0.08, darkMat, 0, -0.15, 0.05));
  tilt.add(bars);
  // rider
  const torso = box(0.44, 0.62, 0.3, suitMat, 0, 1.25, -0.25, 0.35);
  const vest = box(0.48, 0.4, 0.34, body, 0, 1.3, -0.24, 0.35);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), body);
  helmet.position.set(0, 1.68, -0.02);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, 0, 1.2), glassMat);
  visor.position.set(0, 1.68, 0.05);
  visor.rotation.x = 1.4;
  tilt.add(torso, vest, helmet, visor);
  for (const sx of [-1, 1]) {
    tilt.add(box(0.1, 0.1, 0.55, suitMat, sx * 0.26, 1.2, 0.15, 0.6));
    tilt.add(box(0.14, 0.14, 0.6, suitMat, sx * 0.22, 0.86, -0.2, -0.2));
    tilt.add(box(0.12, 0.45, 0.14, suitMat, sx * 0.24, 0.62, 0.1));
  }
  const brakeMat = new THREE.MeshBasicMaterial({ color: 0x8a1020 });
  tilt.add(box(0.3, 0.06, 0.04, brakeMat, 0, 0.5, -1.52));
  tilt.add(box(0.2, 0.08, 0.04, headMat, 0, 0.72, 1.48));
  const f = flame();
  f.position.set(0, 0.25, -1.9);
  f.scale.setScalar(0.8);
  tilt.add(f);
  return { root, tilt, wheels: [], steerPivots: [bars], flames: [f], brakeMat, kind: 'jetski' };
}

// Air racers. Origin at the centre of gravity, nose toward +Z.
export function buildPlane(color, variant = 'prop') {
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  root.add(tilt);
  const body = paint(color);
  const brakeMat = new THREE.MeshBasicMaterial({ color: 0x8a1020 });
  const flames = [];
  let prop = null;
  const along = (geo) => { geo.rotateX(Math.PI / 2); return geo; }; // y-axis primitives -> z-axis

  if (variant === 'jet') {
    tilt.add(new THREE.Mesh(along(new THREE.CylinderGeometry(0.46, 0.56, 5.2, 16)), body).translateZ(0.3));
    tilt.add(new THREE.Mesh(along(new THREE.ConeGeometry(0.46, 1.8, 16)), body).translateZ(3.8));
    tilt.add(new THREE.Mesh(along(new THREE.CylinderGeometry(0.5, 0.42, 0.6, 16)), darkMat).translateZ(-2.55));
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 10), glassMat);
    canopy.scale.set(0.95, 0.85, 2.6);
    canopy.position.set(0, 0.42, 1.6);
    tilt.add(canopy);
    const wing = planform([[-0.4, 1.4], [-3.7, -1.5], [-3.7, -2.1], [3.7, -2.1], [3.7, -1.5], [0.4, 1.4]], 0.12, body);
    wing.position.set(0, -0.12, -0.2);
    tilt.add(wing);
    tilt.add(planform([[-1.2, -0.1], [-0.3, 0.45], [0.3, 0.45], [1.2, -0.1], [1.2, -0.35], [-1.2, -0.35]], 0.06, body).translateZ(2.6).translateY(0.05));
    for (const sx of [-1, 1]) {
      const fin = profileMesh([[-2.5, 0], [-1.5, 0], [-2.3, 1.45], [-2.75, 1.45]], [], 0.06, body, 0.03);
      fin.position.set(sx * 0.5, 0.25, 0);
      fin.rotation.z = -sx * 0.28;
      tilt.add(fin);
      tilt.add(box(0.36, 0.5, 1.6, darkMat, sx * 0.62, -0.05, 1.0));
      tilt.add(box(0.5, 0.05, 2.6, whiteMat, sx * 2.2, -0.02, -1.5));
    }
    navLights(tilt, 3.75, -0.05, -1.8);
    tilt.add(box(0.3, 0.12, 0.05, brakeMat, 0, 0.35, -2.4));
    const f = flame();
    f.position.set(0, 0, -3.4);
    f.scale.set(2.2, 1.6, 2.2);
    tilt.add(f);
    flames.push(f);
  } else {
    tilt.add(new THREE.Mesh(along(new THREE.CylinderGeometry(0.58, 0.22, 6.4, 16)), body).translateZ(-0.2));
    tilt.add(new THREE.Mesh(along(new THREE.CylinderGeometry(0.62, 0.6, 0.8, 16)), darkMat).translateZ(3.1));
    tilt.add(new THREE.Mesh(along(new THREE.ConeGeometry(0.26, 0.6, 12)), whiteMat).translateZ(3.75));
    prop = new THREE.Group();
    prop.position.z = 3.55;
    for (let k = 0; k < 3; k++) {
      const blade = box(0.18, 1.35, 0.05, darkMat, 0, 0.68, 0);
      const holder = new THREE.Group();
      holder.rotation.z = (k / 3) * Math.PI * 2;
      holder.add(blade);
      prop.add(holder);
    }
    tilt.add(prop);
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 10), glassMat);
    canopy.scale.set(1, 0.9, 2.2);
    canopy.position.set(0, 0.5, 0.1);
    tilt.add(canopy);
    const wing = planform([[-4.4, 0.35], [-0.5, 0.95], [0.5, 0.95], [4.4, 0.35], [4.4, -0.3], [0.5, -0.75], [-0.5, -0.75], [-4.4, -0.3]], 0.14, body);
    wing.position.set(0, -0.2, 0.6);
    tilt.add(wing);
    for (const sx of [-1, 1]) tilt.add(box(0.7, 0.03, 0.9, whiteMat, sx * 3.2, -0.11, 0.65));
    tilt.add(planform([[-1.7, 0.15], [-0.2, 0.5], [0.2, 0.5], [1.7, 0.15], [1.7, -0.3], [-1.7, -0.3]], 0.08, body).translateZ(-3.05).translateY(0.05));
    tilt.add(profileMesh([[-3.55, 0.1], [-2.55, 0.1], [-3.05, 1.35], [-3.5, 1.35]], [], 0.08, body, 0.03));
    navLights(tilt, 4.45, -0.15, 0.6);
    tilt.add(box(0.12, 0.12, 0.05, brakeMat, 0, 0.75, -3.6));
    for (const sx of [-1, 1]) {
      const f = flame();
      f.position.set(sx * 0.62, 0, 1.9);
      f.scale.setScalar(0.6);
      tilt.add(f);
      flames.push(f);
    }
  }
  return { root, tilt, wheels: [], steerPivots: [], flames, brakeMat, prop, kind: 'plane' };
}

export function buildModel(spec, color) {
  switch (spec.kind) {
    case 'bike': return buildBike(color, spec.id === 'shade' ? 'naked' : 'super');
    case 'boat': return buildBoat(color);
    case 'jetski': return buildJetski(color);
    case 'plane': return buildPlane(color, spec.variant);
    default: return buildCar(color, spec.id === 'atlas' ? 'muscle' : 'gt');
  }
}

const STEER_ANGLE = { car: 0.45, bike: 0.25, boat: 0.45, jetski: 0.5, plane: 0 };

// Shared per-frame animation for player and AI.
// lean: roll in radians, +right. pitch: +nose down. bob: vertical offset (water).
export function animateModel(m, { dt, speed, steer, lean, pitch = 0, nitro, braking, bob = 0 }) {
  for (const w of m.wheels) w.rotation.x += (speed * dt) / w.userData.radius;
  for (const p of m.steerPivots) p.rotation.y = -steer * STEER_ANGLE[m.kind];
  switch (m.kind) {
    case 'car':
      m.tilt.rotation.z = -lean * 0.12;
      m.tilt.rotation.x = pitch * 0.5;
      break;
    case 'boat':
      m.tilt.rotation.z = lean * 0.35;
      m.tilt.rotation.x = pitch;
      break;
    default: // bike, jetski, plane: full roll into the turn
      m.tilt.rotation.x = pitch;
      m.tilt.rotation.z = lean;
  }
  m.tilt.position.y = bob;
  if (m.prop) m.prop.rotation.z += dt * (35 + speed * 0.5);
  for (const f of m.flames) {
    f.visible = nitro;
    if (nitro) f.scale.y = (m.kind === 'plane' && m.flames.length === 1 ? 1.6 : 1) * (0.8 + Math.random() * 0.8);
  }
  m.brakeMat.color.setHex(braking ? 0xff2a40 : 0x8a1020);
}
