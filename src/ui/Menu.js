import { VEHICLES } from '../config.js';

const $ = (id) => document.getElementById(id);
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

// Vehicle select. Emits onChange(spec, color) for the live 3D preview and
// onStart() when the race should begin.
export class Menu {
  constructor({ onChange, onStart, initial }) {
    this.el = $('menu');
    this.list = $('vehicle-list');
    this.detail = $('vehicle-detail');
    this.onChange = onChange;
    this.onStart = onStart;
    this.spec = VEHICLES.find((v) => v.id === initial?.id) || VEHICLES[0];
    this.color = initial?.color ?? this.spec.colors[0];

    for (const kind of ['car', 'bike']) {
      const group = document.createElement('div');
      group.className = 'vgroup';
      group.innerHTML = `<h3>${kind === 'car' ? 'Cars' : 'Bikes'}</h3>`;
      for (const v of VEHICLES.filter((x) => x.kind === kind)) {
        const b = document.createElement('button');
        b.className = 'vbtn';
        b.type = 'button';
        b.dataset.id = v.id;
        b.innerHTML = `<span class="vbtn-name">${v.name}</span><span class="vbtn-top">${Math.round(v.stats.top * 3.6)} km/h</span>`;
        b.addEventListener('click', () => this.select(v, v.colors[0]));
        group.appendChild(b);
      }
      this.list.appendChild(group);
    }
    $('start-btn').addEventListener('click', () => this.onStart());
    this.render();
  }

  select(spec, color) {
    this.spec = spec;
    this.color = color;
    this.render();
    this.onChange(spec, color);
  }

  render() {
    const v = this.spec;
    this.list.querySelectorAll('.vbtn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === v.id)));
    const bar = (label, val) => `<div class="stat"><span>${label}</span><i><b style="transform:scaleX(${Math.min(1, val).toFixed(2)})"></b></i></div>`;
    this.detail.innerHTML = `
      <p class="vblurb">${v.blurb}</p>
      ${bar('Top speed', (v.stats.top - 70) / 30)}
      ${bar('Acceleration', (v.stats.accel - 16) / 16)}
      ${bar('Handling', (v.stats.handling - 1.4) / 1.5)}
      ${bar('Grip', (v.stats.grip - 6) / 5)}
      <div class="swatches" role="radiogroup" aria-label="Paint">
        ${v.colors.map((c) => `<button type="button" class="swatch" role="radio" aria-checked="${c === this.color}" aria-label="Paint ${hex(c)}" style="--c:${hex(c)}" data-c="${c}"></button>`).join('')}
      </div>`;
    this.detail.querySelectorAll('.swatch').forEach((s) => {
      s.addEventListener('click', () => this.select(v, Number(s.dataset.c)));
    });
  }

  show(v) { this.el.hidden = !v; }
}
