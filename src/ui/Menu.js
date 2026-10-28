import { MODES, vehiclesFor } from '../config.js';

const $ = (id) => document.getElementById(id);
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

const STATS = {
  ground: [['Top speed', 'top'], ['Acceleration', 'accel'], ['Handling', 'handling'], ['Grip', 'grip']],
  air: [['Top speed', 'top'], ['Acceleration', 'accel'], ['Turning', 'handling'], ['Climb', 'climb']],
};

const KEYS = {
  road: [['← → / A D', 'Steer'], ['↓ / S', 'Brake'], ['Space', 'Brake + drift'], ['Shift', 'Nitro (tap)'], ['↑ / W', 'Gas', 'manual-only'], ['C', 'Camera'], ['R', 'Recover'], ['Esc', 'Pause']],
  water: [['← → / A D', 'Steer'], ['↓ / S', 'Reverse thrust'], ['Space', 'Power slide'], ['Shift', 'Nitro (tap)'], ['↑ / W', 'Throttle', 'manual-only'], ['C', 'Camera'], ['R', 'Recover'], ['Esc', 'Pause']],
  air: [['← → / A D', 'Turn'], ['↑ / W', 'Climb'], ['↓ / S', 'Dive'], ['Space', 'Air brake'], ['Shift', 'Nitro (tap)'], ['C', 'Camera'], ['R', 'Recover'], ['Esc', 'Pause']],
};

// Garage: mode tabs, machine list, stats, paint. Emits:
// onMode(modeId, spec, color), onChange(spec, color), onStart()
export class Menu {
  constructor({ mode, selections, onMode, onChange, onStart }) {
    this.el = $('menu');
    this.tabs = $('mode-tabs');
    this.list = $('vehicle-list');
    this.detail = $('vehicle-detail');
    this.selections = selections;
    this.onMode = onMode;
    this.onChange = onChange;
    this.onStart = onStart;

    for (const m of Object.values(MODES)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.role = 'tab';
      b.className = 'mode-tab';
      b.dataset.mode = m.id;
      b.textContent = m.label;
      b.addEventListener('click', () => { if (m.id !== this.mode) this.setMode(m.id, true); });
      this.tabs.appendChild(b);
    }
    $('start-btn').addEventListener('click', () => this.onStart());
    this.setMode(mode, false);
  }

  setMode(id, notify) {
    this.mode = id;
    const list = vehiclesFor(id);
    const sel = this.selections[id];
    this.spec = list.find((v) => v.id === sel?.id) || list[0];
    this.color = this.spec.colors.includes(sel?.color) ? sel.color : this.spec.colors[0];
    this.tabs.querySelectorAll('.mode-tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === id)));
    $('tagline').textContent = `${MODES[id].tagline} Pick a machine.`;
    $('keys').innerHTML = KEYS[id].map(([k, v, cls]) => `<div${cls ? ` class="${cls}"` : ''}><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    this.renderList();
    this.render();
    if (notify) this.onMode(id, this.spec, this.color);
  }

  renderList() {
    this.list.innerHTML = '';
    for (const group of MODES[this.mode].groups) {
      const g = document.createElement('div');
      g.className = 'vgroup';
      g.innerHTML = `<h3>${group.label}</h3>`;
      for (const v of vehiclesFor(this.mode).filter((x) => group.kinds.includes(x.kind))) {
        const b = document.createElement('button');
        b.className = 'vbtn';
        b.type = 'button';
        b.dataset.id = v.id;
        b.innerHTML = `<span class="vbtn-name">${v.name}</span><span class="vbtn-top">${Math.round(v.stats.top * 3.6)} km/h</span>`;
        b.addEventListener('click', () => this.select(v, v.colors[0]));
        g.appendChild(b);
      }
      this.list.appendChild(g);
    }
  }

  select(spec, color) {
    this.spec = spec;
    this.color = color;
    this.selections[this.mode] = { id: spec.id, color };
    this.render();
    this.onChange(spec, color);
  }

  render() {
    const v = this.spec;
    const peers = vehiclesFor(this.mode);
    this.list.querySelectorAll('.vbtn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === v.id)));
    // bars compare machines within this mode
    const norm = (key) => {
      const vals = peers.map((p) => p.stats[key]);
      const lo = Math.min(...vals);
      const hi = Math.max(...vals);
      return hi === lo ? 0.6 : 0.3 + 0.65 * ((v.stats[key] - lo) / (hi - lo));
    };
    const bar = ([label, key]) => `<div class="stat"><span>${label}</span><i><b style="transform:scaleX(${norm(key).toFixed(2)})"></b></i></div>`;
    this.detail.innerHTML = `
      <p class="vblurb">${v.blurb}</p>
      ${STATS[this.mode === 'air' ? 'air' : 'ground'].map(bar).join('')}
      <div class="swatches" role="radiogroup" aria-label="Paint">
        ${v.colors.map((c) => `<button type="button" class="swatch" role="radio" aria-checked="${c === this.color}" aria-label="Paint ${hex(c)}" style="--c:${hex(c)}" data-c="${c}"></button>`).join('')}
      </div>`;
    this.detail.querySelectorAll('.swatch').forEach((s) => {
      s.addEventListener('click', () => this.select(v, Number(s.dataset.c)));
    });
  }

  show(v) { this.el.hidden = !v; }
}
