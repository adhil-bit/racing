// Track outline rendered once to an offscreen canvas; racers drawn per frame.
export class Minimap {
  constructor(canvas, track) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.track = track;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = 168;
    canvas.width = canvas.height = size * dpr;
    this.size = size;
    this.dpr = dpr;
    const b = track.bounds;
    const w = b.max.x - b.min.x;
    const h = b.max.z - b.min.z;
    this.scale = (size - 24) / Math.max(w, h);
    this.ox = (size - w * this.scale) / 2 - b.min.x * this.scale;
    this.oz = (size - h * this.scale) / 2 - b.min.z * this.scale;

    this.base = document.createElement('canvas');
    this.base.width = this.base.height = size * dpr;
    const g = this.base.getContext('2d');
    g.scale(dpr, dpr);
    g.lineJoin = 'round';
    g.beginPath();
    track.points.forEach((p, i) => {
      const [x, y] = this.map(p);
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    });
    g.closePath();
    g.strokeStyle = 'rgba(16,26,58,0.9)';
    g.lineWidth = 9;
    g.stroke();
    g.strokeStyle = 'rgba(238,242,255,0.75)';
    g.lineWidth = 3;
    g.stroke();
    const [sx, sy] = this.map(track.points[0]);
    g.fillStyle = '#ffb84d';
    g.fillRect(sx - 5, sy - 1.5, 10, 3);
  }

  // Several minimaps (one per mode) share the HUD canvas; nothing to rebind
  // beyond redrawing, which draw() does every frame.
  rebind() {}

  map(p) {
    // top-down view: screen right = +X, screen down = +Z (not mirrored)
    return [p.x * this.scale + this.ox, p.z * this.scale + this.oz];
  }

  draw(racers, player) {
    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.drawImage(this.base, 0, 0);
    g.scale(this.dpr, this.dpr);
    for (const r of racers) {
      if (r === player) continue;
      const [x, y] = this.map(r.pos);
      g.fillStyle = '#ff3355';
      g.beginPath();
      g.arc(x, y, 3.5, 0, Math.PI * 2);
      g.fill();
    }
    const [x, y] = this.map(player.pos);
    g.fillStyle = '#ffb84d';
    g.strokeStyle = '#101a3a';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(x, y, 5.5, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
}
