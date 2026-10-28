// Unified controls from keyboard, gamepad and on-screen touch buttons.
// Systems read one normalised object: { throttle, brake, steer, handbrake, nitro }.

const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'hand',
  ShiftLeft: 'nitro', ShiftRight: 'nitro', KeyN: 'nitro',
};

export class Input {
  constructor() {
    this.keys = new Set();
    this.touch = new Set();
    this.listeners = {};
    this.state = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false };
    this.nitroPressed = false; // latched until the next poll so instant taps aren't lost
    this.autoThrottle = true; // full throttle unless braking; toggled from the garage
    this.flightMode = false;  // air races: ↑/↓ climb and dive, Space is the air brake
    this.prevPadButtons = [];

    window.addEventListener('keydown', (e) => {
      const k = KEYMAP[e.code];
      if (k) { this.keys.add(k); e.preventDefault(); }
      if (k === 'nitro' && !e.repeat) this.nitroPressed = true;
      if (!e.repeat) this.emit(e.code);
    });
    window.addEventListener('keyup', (e) => {
      const k = KEYMAP[e.code];
      if (k) this.keys.delete(k);
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.touch.clear(); });

    document.querySelectorAll('[data-control]').forEach((el) => {
      const c = el.dataset.control;
      const on = (e) => {
        e.preventDefault();
        this.touch.add(c);
        el.classList.add('is-down');
        if (c === 'nitro') this.nitroPressed = true;
      };
      const off = (e) => { e.preventDefault(); this.touch.delete(c); el.classList.remove('is-down'); };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('pointerleave', off);
    });
  }

  on(code, fn) {
    (this.listeners[code] ||= []).push(fn);
  }

  emit(code) {
    (this.listeners[code] || []).forEach((fn) => fn());
  }

  poll() {
    const has = (k) => this.keys.has(k) || this.touch.has(k);
    let throttle = has('up') ? 1 : 0;
    let brake = has('down') ? 1 : 0;
    let steer = (has('right') ? 1 : 0) - (has('left') ? 1 : 0);
    let handbrake = has('hand');
    let nitro = has('nitro');
    let pitch = (has('up') ? 1 : 0) - (has('down') ? 1 : 0);

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads && Array.from(pads).find(Boolean);
    if (pad) {
      const ax = pad.axes[0] || 0;
      if (Math.abs(ax) > 0.12) steer = ax;
      const ay = pad.axes[1] || 0;
      if (Math.abs(ay) > 0.15) pitch = -ay;
      const rt = pad.buttons[7]?.value || 0;
      const lt = pad.buttons[6]?.value || 0;
      throttle = Math.max(throttle, rt);
      brake = Math.max(brake, lt);
      handbrake ||= !!pad.buttons[2]?.pressed;
      const padNitro = !!pad.buttons[0]?.pressed;
      if (padNitro && !this.prevPadButtons[0]) this.nitroPressed = true;
      this.prevPadButtons[0] = padNitro;
      nitro ||= padNitro;
      // start button -> pause, Y -> camera, B -> reset
      const map = { 9: 'Escape', 3: 'KeyC', 1: 'KeyR' };
      for (const [i, code] of Object.entries(map)) {
        const p = !!pad.buttons[i]?.pressed;
        if (p && !this.prevPadButtons[i]) this.emit(code);
        this.prevPadButtons[i] = p;
      }
    }
    // auto-accelerate: Down/S or Space take over; releasing them goes straight back to full gas
    if (this.flightMode) {
      brake = 0;
      throttle = handbrake ? 0 : 1;
    } else if (this.autoThrottle) throttle = brake > 0.05 || handbrake ? 0 : 1;
    const nitroPress = this.nitroPressed;
    this.nitroPressed = false;
    Object.assign(this.state, { throttle, brake, steer, handbrake, nitro, nitroPress, pitch });
    return this.state;
  }
}
