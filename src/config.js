// Central tuning file. Every gameplay number lives here so balancing never
// requires digging through systems code. Speeds are metres/second.

export const RACE = {
  laps: 3,
  opponents: 5,
  countdown: 3,
  playerGridSlot: 3,
};

export const TRACK = {
  width: 22,          // drivable asphalt width (m)
  curbWidth: 1.6,
  wallOffset: 1.9,    // wall distance beyond road edge
  wallHeight: 1.2,
  samples: 1600,      // centreline resolution
};

// stats: top (m/s), accel (m/s²), brake (m/s²), handling (rad/s at full lock),
// grip (lateral damping /s), nitro (top-speed multiplier while boosting)
export const VEHICLES = [
  {
    id: 'vortex', kind: 'car', name: 'Vortex GT',
    blurb: 'Balanced grand tourer. Holds its line through fast sweepers.',
    colors: [0x2f6bff, 0xe8ecf5, 0x18c99a],
    stats: { top: 88, accel: 24, brake: 50, handling: 2.0, grip: 10, nitro: 1.32 },
  },
  {
    id: 'atlas', kind: 'car', name: 'Atlas V8',
    blurb: 'Heavy muscle coupe. Highest top speed, loose on corner exit.',
    colors: [0xff3355, 0xffb84d, 0x2a2f45],
    stats: { top: 96, accel: 21, brake: 44, handling: 1.75, grip: 7.5, nitro: 1.38 },
  },
  {
    id: 'raptor', kind: 'bike', name: 'Raptor 1000',
    blurb: 'Litre-class superbike. Brutal launch, light on the front.',
    colors: [0xffb84d, 0x4fe3ff, 0xff3355],
    stats: { top: 92, accel: 31, brake: 42, handling: 2.35, grip: 8, nitro: 1.3 },
  },
  {
    id: 'shade', kind: 'bike', name: 'Shade 750',
    blurb: 'Middleweight. Turns in tighter than anything on the grid.',
    colors: [0x9b6bff, 0xe8ecf5, 0x18c99a],
    stats: { top: 84, accel: 27, brake: 46, handling: 2.8, grip: 9.5, nitro: 1.3 },
  },
];

export const AI_ROSTER = [
  { name: 'Kestrel', skill: 1.0 },
  { name: 'Mara Voss', skill: 0.97 },
  { name: 'Diesel', skill: 0.95 },
  { name: 'Juno Park', skill: 0.99 },
  { name: 'Okafor', skill: 0.93 },
];

export const CAMERA = {
  baseFov: 66,
  speedFov: 14,   // extra FOV at top speed
  nitroFov: 8,
};

export const STORAGE_KEY = 'apexrush.v1';
