import * as THREE from 'three';

// All textures are generated on canvases at boot: zero asset downloads,
// which keeps the deploy a single static bundle.

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function finish(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

export function roadTexture() {
  const [c, g] = canvas(512, 1024);
  g.fillStyle = '#353946';
  g.fillRect(0, 0, 512, 1024);
  for (let i = 0; i < 14000; i++) {
    const v = 30 + Math.random() * 40;
    g.fillStyle = `rgba(${v},${v + 2},${v + 8},${Math.random() * 0.5})`;
    g.fillRect(Math.random() * 512, Math.random() * 1024, 2, 2);
  }
  // racing-line rubber in the middle third
  const grad = g.createLinearGradient(0, 0, 512, 0);
  grad.addColorStop(0.3, 'rgba(10,10,14,0)');
  grad.addColorStop(0.5, 'rgba(10,10,14,0.35)');
  grad.addColorStop(0.7, 'rgba(10,10,14,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 1024);
  g.fillStyle = '#e9edf5';
  g.fillRect(14, 0, 8, 1024);
  g.fillRect(490, 0, 8, 1024);
  g.fillStyle = 'rgba(233,237,245,0.85)';
  for (const x of [512 / 3, (512 * 2) / 3]) g.fillRect(x - 3, 0, 6, 460);
  return finish(c);
}

export function curbTexture() {
  const [c, g] = canvas(64, 128);
  g.fillStyle = '#e63946';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#eef2ff';
  g.fillRect(0, 64, 64, 64);
  return finish(c);
}

export function wallTexture() {
  const [c, g] = canvas(256, 64);
  g.fillStyle = '#39405a';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#2a3048';
  for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 2, 64);
  g.fillStyle = '#ffb84d';
  g.fillRect(0, 26, 256, 6);
  return finish(c);
}

export function groundTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#1a1f2e';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3000; i++) {
    const v = 22 + Math.random() * 20;
    g.fillStyle = `rgb(${v},${v + 4},${v + 14})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  g.strokeStyle = 'rgba(120,140,200,0.08)';
  g.lineWidth = 2;
  g.strokeRect(0, 0, 256, 256);
  return finish(c);
}

export function windowTexture() {
  const [c, g] = canvas(256, 512);
  g.fillStyle = '#141a2c';
  g.fillRect(0, 0, 256, 512);
  const cols = 8;
  const rows = 16;
  const cw = 256 / cols;
  const rh = 512 / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const r = Math.random();
      if (r < 0.38) {
        const warm = Math.random() < 0.7;
        const a = 0.55 + Math.random() * 0.45;
        g.fillStyle = warm ? `rgba(255,214,150,${a})` : `rgba(150,210,255,${a})`;
      } else {
        g.fillStyle = '#1d2540';
      }
      g.fillRect(x * cw + 6, y * rh + 7, cw - 12, rh - 12);
    }
  }
  // dark border: UV (0,0) lands here, so roofs sample a dark texel
  g.fillStyle = '#10152a';
  g.fillRect(0, 0, 256, 4);
  g.fillRect(0, 508, 256, 4);
  g.fillRect(0, 0, 4, 512);
  g.fillRect(252, 0, 4, 512);
  return finish(c);
}

export function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const [c, g] = canvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return finish(c, false);
}

export function checkerTexture() {
  const [c, g] = canvas(256, 32);
  for (let x = 0; x < 16; x++) {
    for (let y = 0; y < 2; y++) {
      g.fillStyle = (x + y) % 2 ? '#eef2ff' : '#1a1f2e';
      g.fillRect(x * 16, y * 16, 16, 16);
    }
  }
  return finish(c, false);
}

export function bannerTexture(text) {
  const [c, g] = canvas(1024, 128);
  g.fillStyle = '#101a3a';
  g.fillRect(0, 0, 1024, 128);
  g.fillStyle = '#ffb84d';
  g.font = 'italic 800 84px "Saira Condensed", "Arial Narrow", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 512, 68);
  return finish(c, false);
}
