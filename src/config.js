// Central tuning file. Every gameplay number lives here so balancing never
// requires digging through systems code. Speeds are metres/second.

export const RACE = {
  laps: 3,
  opponents: 5,
  countdown: 3,
  playerGridSlot: 3,
};

// stats: top (m/s), accel (m/s²), brake (m/s²), handling (rad/s at full lock),
// grip (lateral damping /s; low = slides), nitro (top-speed multiplier while boosting)
// planes also use climb (m/s vertical speed at full stick)
export const VEHICLES = [
  // ---- road ----
  {
    id: 'vortex', mode: 'road', kind: 'car', name: 'Vortex GT',
    blurb: 'Balanced grand tourer. Holds its line through fast sweepers.',
    colors: [0x2f6bff, 0xe8ecf5, 0x18c99a],
    stats: { top: 88, accel: 24, brake: 50, handling: 2.0, grip: 10, nitro: 1.32 },
  },
  {
    id: 'atlas', mode: 'road', kind: 'car', name: 'Atlas V8',
    blurb: 'Heavy muscle coupe. Highest top speed, loose on corner exit.',
    colors: [0xff3355, 0xffb84d, 0x2a2f45],
    stats: { top: 96, accel: 21, brake: 44, handling: 1.75, grip: 7.5, nitro: 1.38 },
  },
  {
    id: 'raptor', mode: 'road', kind: 'bike', name: 'Raptor 1000',
    blurb: 'Litre-class superbike. Brutal launch, light on the front.',
    colors: [0xffb84d, 0x4fe3ff, 0xff3355],
    stats: { top: 92, accel: 31, brake: 42, handling: 2.35, grip: 8, nitro: 1.3 },
  },
  {
    id: 'shade', mode: 'road', kind: 'bike', name: 'Shade 750',
    blurb: 'Middleweight. Turns in tighter than anything on the grid.',
    colors: [0x9b6bff, 0xe8ecf5, 0x18c99a],
    stats: { top: 84, accel: 27, brake: 46, handling: 2.8, grip: 9.5, nitro: 1.3 },
  },
  // ---- water ----
  {
    id: 'riptide', mode: 'water', kind: 'boat', name: 'Riptide 42',
    blurb: 'Offshore catamaran. Huge top speed, swings wide in the bends.',
    colors: [0xff3355, 0xeef2ff, 0x2f6bff],
    stats: { top: 80, accel: 17, brake: 24, handling: 1.55, grip: 3.4, nitro: 1.35 },
  },
  {
    id: 'skimmer', mode: 'water', kind: 'jetski', name: 'Skimmer RX',
    blurb: 'Sit-down jet ski. Snaps into turns and launches out of them.',
    colors: [0xffb84d, 0x18c99a, 0x9b6bff],
    stats: { top: 70, accel: 25, brake: 28, handling: 2.5, grip: 4.6, nitro: 1.32 },
  },
  // ---- air ----
  {
    id: 'hornet', mode: 'air', kind: 'plane', variant: 'prop', name: 'Hornet Racer',
    blurb: 'Propeller racer. Tightest turns and the quickest climb in the sky.',
    colors: [0xffb84d, 0xff3355, 0xe8ecf5],
    stats: { top: 118, accel: 16, brake: 30, handling: 1.3, grip: 6, nitro: 1.3, climb: 28 },
  },
  {
    id: 'vector', mode: 'air', kind: 'plane', variant: 'jet', name: 'Vector Jet',
    blurb: 'Light jet. Fastest thing here, but it needs room to turn.',
    colors: [0x8a93b8, 0x2f6bff, 0x18c99a],
    stats: { top: 130, accel: 14, brake: 34, handling: 1.05, grip: 5, nitro: 1.35, climb: 24 },
  },
];

// Each mode is its own world: track, environment builder and machines.
// Track control points are [x, z] (or [x, z, altitude] in the air).
export const MODES = {
  road: {
    id: 'road', label: 'Road', tagline: 'Three laps through the night city.',
    groups: [{ label: 'Cars', kinds: ['car'] }, { label: 'Bikes', kinds: ['bike'] }],
    track: {
      scale: 8.5, width: 22, curbWidth: 1.6, wallOffset: 1.9, wallHeight: 1.2,
      control: [
        [0, 0], [0, 38], [6, 58], [22, 70], [42, 68], [52, 56], [52, 42],
        [62, 32], [80, 34], [94, 46], [110, 50], [124, 40], [128, 20],
        [118, 4], [100, 0], [86, -10], [80, -28], [66, -42], [42, -42],
        [26, -32], [10, -26], [0, -14],
      ],
    },
    gridSpacing: 16, aiCornerGrip: 54, cameraFar: 2600,
  },
  water: {
    id: 'water', label: 'Water', tagline: 'Three laps of the harbour canals.',
    groups: [{ label: 'Boats', kinds: ['boat', 'jetski'] }],
    track: {
      scale: 9.5, width: 34, wallOffset: 1.0,
      control: [[0, 0], [0, 30], [8, 52], [26, 62], [46, 58], [60, 46], [78, 44], [96, 56], [114, 58], [126, 44], [124, 24], [108, 12], [92, 14], [78, 4], [74, -16], [60, -30], [38, -34], [18, -26], [4, -14]],
    },
    gridSpacing: 20, aiCornerGrip: 30, cameraFar: 2600,
  },
  air: {
    id: 'air', label: 'Air', tagline: 'Three laps through the sky gates.',
    groups: [{ label: 'Planes', kinds: ['plane'] }],
    track: {
      scale: 13, width: 46, height: 30, wallOffset: 0,
      control: [[0, 0, 150], [0, 35, 175], [6, 65, 215], [24, 88, 240], [56, 98, 215], [90, 94, 170], [118, 82, 140], [134, 58, 160], [132, 30, 205], [118, 8, 235], [92, -8, 200], [62, -16, 160], [34, -14, 130], [12, -8, 135]],
    },
    // AI planes don't pay the climb penalty you do, so they fly a touch slower
    gridSpacing: 34, aiCornerGrip: 60, aiPace: 0.86, cameraFar: 5200, rollingStart: 0.6,
  },
};

export const vehiclesFor = (mode) => VEHICLES.filter((v) => v.mode === mode);

export const AI_ROSTER = [
  { name: 'Kestrel', skill: 1.0 },
  { name: 'Mara Voss', skill: 0.97 },
  { name: 'Diesel', skill: 0.95 },
  { name: 'Juno Park', skill: 0.99 },
  { name: 'Okafor', skill: 0.93 },
];

// Nitro is a timed burst: tap to fire, then it recharges before it can be used again.
export const NITRO = {
  duration: 3,         // seconds of boost per tap
  recharge: 8,         // seconds to refill from empty
  driftMultiplier: 2,  // recharge runs this much faster while drifting
};

// Per-kind camera rig: [distance, height] for chase/far, [forward, height] for cockpit.
export const CAMERA = {
  baseFov: 66,
  speedFov: 14,
  nitroFov: 8,
  rigs: {
    car: { chase: [6.6, 2.5], far: [10.5, 3.8], cockpit: [0.6, 1.2] },
    bike: { chase: [4.3, 1.85], far: [10.5, 3.8], cockpit: [0.35, 1.55] },
    boat: { chase: [9, 3.4], far: [14, 5.2], cockpit: [1.4, 2.3] },
    jetski: { chase: [4.8, 2.1], far: [10.5, 3.8], cockpit: [0.2, 1.75] },
    plane: { chase: [17, 4.4], far: [28, 8], cockpit: [2.2, 0.95] },
  },
};

export const STORAGE_KEY = 'apexrush.v1';
