import * as THREE from 'three';
import * as tex from './textures.js';
import { ribbon, off, buildSky, addLights, buildCity, buildGantry } from './common.js';

// Harbour water: no geometry waves (the plane is huge), just a fragment shader
// with layered moving ripples, glints of city light and the scene's fog.
function waterMaterial() {
  return new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
    vertexShader: `
      varying vec3 vW;
      #include <fog_pars_vertex>
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vW;
      #include <fog_pars_fragment>
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec2 p = vW.xz;
        float w = sin(p.x * 0.11 + uTime * 1.3) * 0.5 + sin(p.y * 0.08 - uTime * 1.1) * 0.5
                + sin((p.x + p.y) * 0.21 + uTime * 2.0) * 0.35;
        vec3 deep = vec3(0.04, 0.12, 0.2);
        vec3 crest = vec3(0.1, 0.28, 0.4);
        vec3 c = mix(deep, crest, smoothstep(-0.6, 1.2, w));
        // glints: sparse cells that flicker on wave crests
        vec2 cell = floor(p * 0.9 + vec2(uTime * 0.6, uTime * 0.35));
        float g = step(0.985, hash(cell)) * smoothstep(0.4, 1.1, w);
        c += g * vec3(1.0, 0.82, 0.55) * 0.9;
        gl_FragColor = vec4(c, 1.0);
        #include <fog_fragment>
      }`,
  });
}

export function buildWaterWorld(scene, track) {
  const half = track.width / 2;
  const lineLat = half + track.wallOffset;

  scene.fog = new THREE.Fog(0x1c2a44, 180, 1250);
  const sky = buildSky(scene, { horizon: [0.55, 0.30, 0.36], mid: [0.13, 0.19, 0.36], top: [0.04, 0.07, 0.16] });
  addLights(scene, { sky: 0xa8c4ff, ground: 0x1c2a3a, hemi: 1.2 });

  const water = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), waterMaterial());
  water.rotation.x = -Math.PI / 2;
  water.position.set((track.bounds.min.x + track.bounds.max.x) / 2, 0, (track.bounds.min.z + track.bounds.max.z) / 2);
  scene.add(water);

  // buoys every few metres, alternating red/white, with a lit one every 8th
  const every = 3;
  const n = Math.floor(track.count / every) * 2;
  const buoys = new THREE.InstancedMesh(new THREE.SphereGeometry(0.6, 10, 8), new THREE.MeshStandardMaterial({ roughness: 0.5 }), n);
  const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd08a }), Math.ceil(n / 8));
  const d = new THREE.Object3D();
  const red = new THREE.Color(0xff3355);
  const white = new THREE.Color(0xeef2ff);
  let b = 0;
  let l = 0;
  for (let i = 0; i < track.count; i += every) {
    for (const s of [-1, 1]) {
      const p = off(track, i, s * lineLat, 0.15);
      d.position.copy(p); d.updateMatrix();
      buoys.setMatrixAt(b, d.matrix);
      buoys.setColorAt(b, (i / every) % 2 ? red : white);
      if ((i / every) % 8 === 0 && l < lamps.count) {
        d.position.y = 0.85; d.updateMatrix();
        lamps.setMatrixAt(l++, d.matrix);
      }
      b++;
    }
  }
  buoys.count = b;
  lamps.count = l;
  scene.add(buoys, lamps);

  // neon float line linking the buoys (reads as the course edge at speed)
  const glow = new THREE.MeshBasicMaterial({ color: 0x4fe3ff, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    scene.add(ribbon(track, (i) => [off(track, i, s * lineLat, 0.32), off(track, i, s * (lineLat + 0.22), 0.32)], 8, glow));
  }

  // start line: floating checker strip + gantry on pontoon legs
  const p0 = track.points[0];
  const heading = Math.atan2(track.tangents[0].x, track.tangents[0].z);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(track.width, 2.5), new THREE.MeshBasicMaterial({ map: tex.checkerTexture(), transparent: true, opacity: 0.85 }));
  line.rotation.order = 'YXZ';
  line.rotation.set(-Math.PI / 2, heading, 0);
  line.position.set(p0.x, 0.06, p0.z);
  scene.add(line);
  buildGantry(scene, track, { span: lineLat * 2 + 3, height: 12, pillarDown: 3 });

  // bridges across the channel
  const concrete = new THREE.MeshStandardMaterial({ color: 0x3a4262, roughness: 0.8, metalness: 0.2 });
  const strip = new THREE.MeshBasicMaterial({ color: 0xffb84d });
  for (const f of [0.2, 0.47, 0.74]) {
    const i = Math.floor(track.count * f);
    const p = track.points[i];
    const t = track.tangents[i];
    const g = new THREE.Group();
    const span = lineLat * 2 + 24;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(span, 1.6, 9), concrete);
    deck.position.y = 11;
    const under = new THREE.Mesh(new THREE.BoxGeometry(span, 0.12, 0.3), strip);
    under.position.set(0, 10.15, 4.2);
    const under2 = under.clone();
    under2.position.z = -4.2;
    g.add(deck, under, under2);
    for (const s of [-1, 1]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(3, 14, 7), concrete);
      pier.position.set(s * (lineLat + 7), 4.5, 0);
      g.add(pier);
      for (let k = -4; k <= 4; k++) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.4, 0.3), strip);
        lamp.position.set((k / 4) * (span / 2 - 1), 12.5, s * 4.3);
        g.add(lamp);
      }
    }
    g.position.set(p.x, 0, p.z);
    g.rotation.y = Math.atan2(t.x, t.z);
    scene.add(g);
  }

  // waterfront towers rise straight out of the harbour
  buildCity(scene, track, { clearance: lineLat + 18, baseY: -2, nearH: 90, count: 300 });

  return {
    sky,
    update(time) { water.material.uniforms.uTime.value = time; },
  };
}
