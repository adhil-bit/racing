const $ = (id) => document.getElementById(id);

export function formatTime(t) {
  if (!isFinite(t) || t <= 0) return '–:––.–––';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

const GEARS = [0, 18, 32, 46, 60, 74, 999];

export function gearFor(speed) {
  if (speed < -0.5) return { gear: 'R', rpm: Math.min(1, -speed / 16) };
  for (let g = 1; g < GEARS.length; g++) {
    if (speed < GEARS[g]) {
      const lo = GEARS[g - 1];
      const hi = Math.min(GEARS[g], 100);
      return { gear: String(g), rpm: 0.25 + 0.75 * ((speed - lo) / (hi - lo)) };
    }
  }
  return { gear: '6', rpm: 1 };
}

export class HUD {
  constructor() {
    this.el = $('hud');
    this.speed = $('hud-speed');
    this.gear = $('hud-gear');
    this.rpm = $('hud-rpm');
    this.nitro = $('hud-nitro');
    this.nitroLabel = $('hud-nitro-label');
    this.pos = $('hud-pos');
    this.posOf = $('hud-pos-of');
    this.lap = $('hud-lap');
    this.lapTime = $('hud-laptime');
    this.best = $('hud-best');
    this.total = $('hud-total');
    this.count = $('countdown');
    this.banner = $('banner');
    this.bannerTimer = 0;
    this.last = {};
  }

  show(v) { this.el.hidden = !v; }

  set(el, key, value) {
    if (this.last[key] !== value) { el.textContent = value; this.last[key] = value; }
  }

  update(d) {
    this.set(this.speed, 'speed', String(Math.round(Math.abs(d.speed) * 3.6)));
    const { gear, rpm } = gearFor(d.speed);
    this.set(this.gear, 'gear', gear);
    this.rpm.style.transform = `scaleX(${Math.min(1, rpm).toFixed(3)})`;
    this.nitro.style.transform = `scaleX(${d.nitro.toFixed(3)})`;
    const bar = this.nitro.parentElement;
    if (bar.dataset.state !== d.nitroPhase) {
      bar.dataset.state = d.nitroPhase;
      document.body.dataset.nitro = d.nitroPhase; // dims the touch button while charging
    }
    const label = d.nitroPhase === 'ready' ? 'Nitro ready'
      : d.nitroPhase === 'boost' ? 'Boost'
      : `Charging ${Math.ceil(d.nitroEta)}s`;
    this.set(this.nitroLabel, 'nitroLabel', label);
    this.set(this.pos, 'pos', String(d.position));
    this.set(this.posOf, 'posOf', `/${d.racers}`);
    this.set(this.lap, 'lap', `Lap ${Math.min(d.lap, d.laps)} of ${d.laps}`);
    this.set(this.lapTime, 'lapTime', formatTime(d.lapTime));
    this.set(this.best, 'best', formatTime(d.bestLap));
    this.set(this.total, 'total', formatTime(d.total));
    if (this.bannerTimer > 0) {
      this.bannerTimer -= d.dt;
      if (this.bannerTimer <= 0) this.banner.classList.remove('is-on');
    }
  }

  flash(text, seconds = 2, tone = '') {
    this.banner.textContent = text;
    this.banner.dataset.tone = tone;
    this.banner.classList.add('is-on');
    this.bannerTimer = seconds;
  }

  wrongWay(on) {
    if (on) this.flash('Wrong way — press R to recover', 0.3, 'warn');
  }

  countdown(text) {
    this.count.textContent = text;
    this.count.classList.remove('is-pop');
    void this.count.offsetWidth;
    if (text) this.count.classList.add('is-pop');
  }
}
