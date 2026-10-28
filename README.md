# SkyDrive X

Arcade racing in the browser across three separate worlds, each with its own
course, machines and handling:

| Mode | World | Machines |
| --- | --- | --- |
| **Road** | 3.6 km night-city street circuit | Vortex GT, Atlas V8 (cars) · Raptor 1000, Shade 750 (bikes) |
| **Water** | 3.7 km harbour canal course with bridges and buoy lines | Riptide 42 (offshore catamaran) · Skimmer RX (jet ski) |
| **Air** | 5.3 km sunset sky course through gate rings, 130–240 m up | Hornet Racer (propeller) · Vector Jet |

Race five rivals over three laps. Built with Three.js and Vite; there are no
image or sound files: every texture is drawn on a canvas at boot and every sound
is synthesised with Web Audio.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build -> dist/
npm run build:single   # everything inlined -> dist-single/index.html
```

## Controls

Auto-accelerate is on by default on road and water: you're always on full gas
and braking takes over while you hold a brake key (turn it off in the garage for
manual throttle). Planes always have thrust on.

| Action | Road / Water | Air | Gamepad | Touch |
| --- | --- | --- | --- | --- |
| Steer / turn | ← → or A D | ← → or A D | Left stick | ◀ ▶ |
| Brake | ↓ or S | — | LT | Brake |
| Climb / dive | — | ↑ / ↓ or W / S | Left stick up/down | Climb / Dive |
| Brake + drift · power slide · air brake | Space | Space | X | Drift / Slide / Air brake |
| Nitro (tap) | Shift | Shift | A | Nitro |
| Throttle (manual mode) | ↑ or W | — | RT | Gas |
| Camera (chase, far, cockpit) | C | C | Y | Camera |
| Recover onto the course | R | R | B | — |
| Pause | Esc or P | Esc or P | Start | Pause |

Nitro is a timed burst: tap for 3 seconds of boost, then it recharges over
8 seconds (twice as fast while drifting) and chimes when it's ready again.
Tune it in `NITRO` in `config.js`.

## Architecture

```
src/
├─ main.js               entry: boots Game, shows a WebGL error if it can't
├─ config.js             every tunable number: modes + tracks, machines, nitro, camera rigs
├─ core/
│  ├─ Game.js            state machine + main loop, camera rig, collisions, laps, results
│  ├─ Input.js           keyboard + gamepad + touch -> one normalised control object
│  └─ AudioEngine.js     synthesised engine, nitro, tyre squeal, impacts
├─ world/
│  ├─ Track.js           spline centreline (with altitude), samples, projection, curvature
│  ├─ index.js           picks the world builder for a mode
│  ├─ common.js          shared: ribbons, sky dome, merged city, lights, start gantry
│  ├─ RoadWorld.js       road, curbs, walls, street lamps
│  ├─ WaterWorld.js      harbour water shader, buoy lines, bridges, waterfront
│  ├─ AirWorld.js        sunset sky, gate rings, clouds, mountains, city below
│  └─ textures.js        canvas-generated textures
├─ vehicles/
│  ├─ models.js          procedural cars, bikes, boats, jet ski, planes + shared animation
│  ├─ Vehicle.js         ground and water physics (cars, bikes, boats, jet ski)
│  └─ Plane.js           flight physics
├─ ai/
│  └─ AIRacer.js         AI drivers
├─ fx/
│  └─ Particles.js       pooled tyre smoke, sparks, wakes, spray, contrails
└─ ui/
   ├─ Menu.js            garage: vehicle and paint select with live 3D preview
   ├─ HUD.js             speed, gear, rpm, nitro, position, lap times, banners
   └─ Minimap.js         canvas track map
```

### Game loop

`Game` owns one `requestAnimationFrame` loop (via `renderer.setAnimationLoop`)
and a small state machine:

```
menu ──Start──▶ countdown ──3·2·1──▶ racing ──3 laps──▶ finished
                                        ▲  │
                                 Resume │  ▼ Esc
                                       paused
```

Each frame: poll input → update player → update AI → resolve collisions →
lap and position bookkeeping → effects → camera → audio → HUD → render.
`dt` is clamped to 50 ms so a background tab can't teleport cars through walls.

### Track

A closed Catmull-Rom spline through 22 control points, resampled into 1,600
equally spaced samples. Each sample stores position, tangent, right vector and
signed curvature. Two operations power almost everything else:

- `project(pos, hint)` finds the nearest sample by scanning ±30 samples around
  the last known index, giving lateral offset (for walls) and distance along the
  lap (for progress and laps) in constant time.
- `curvatureAhead(index, n)` gives the sharpest bend coming up, which the AI
  uses to choose braking points.

Road, curbs, run-off, walls and the neon wall-top strip are all generated as
ribbons that follow these samples.

### Vehicle physics (player)

An arcade bicycle model. World velocity persists between frames; every frame it
is split into forward and lateral components relative to the current heading.
Throttle, brake, drag and nitro act on the forward part. Steering rotates the
heading with authority that fades in from standstill and tapers near top speed.
After rotating, the velocity is re-split and the lateral part is damped by grip
(`exp(-grip·dt)`). High grip snaps the car onto its new heading; the handbrake
drops grip so the old velocity survives the turn, which is what produces drifts.

Bikes use the same model with different stats and a visual lean of
`atan(lateral acceleration / g)`, so lean angle is physically consistent with
how hard you're cornering.

Walls are a corridor constraint: if the lateral offset passes the limit the
vehicle is pushed back, the into-wall velocity is reflected and damped, speed is
scrubbed, and the nose is nudged parallel to the wall so you can't get pinned.

### AI

AI drivers are kinematic: they move along the track in distance space with a
lateral lane offset, so they can never leave the circuit and cost almost
nothing to simulate. Target speed is `min(top, √(lateral grip / curvature ahead))`,
with the look-ahead distance growing with speed. They change lanes at random,
move out of the way of a player directly ahead, use nitro on straights, and
apply mild rubber-banding (at most +12% when behind the player, −7% when ahead)
so a clean race still wins.

### Modes

A mode bundles a track definition, a world builder and its machines
(`MODES` in `config.js`). `Game.loadMode()` builds a mode's scene the first
time you open it and caches it, so switching tabs in the garage is instant
afterwards. Water uses the ground physics with low grip, heavy drag when
coasting, hull bob and bow lift. Planes use `Plane.js`: always-on thrust,
coordinated turns, climb and dive that trade speed for height, and a corridor
of gates instead of walls. Air races use a rolling start.

### Rendering budget

Lamps use instanced meshes, the ~340 buildings are merged into one geometry
with an emissive window texture, and particles come from fixed pools. No
shadows or post-processing, so it holds frame rate on mid-range phones.

## Deploy to Vercel

The repo includes `vercel.json` (Vite framework preset, `dist` output,
long-cache headers for hashed assets).

1. Push this repo to GitHub.
2. In Vercel, choose **Add New → Project**, import the repo, and keep the
   detected settings.
3. Every push to `main` now deploys to production, and every pull request gets
   a preview URL.

Or from the command line: `npx vercel` (preview) and `npx vercel --prod`.

## Extending it

- **New vehicle:** add an entry to `VEHICLES` in `config.js`; give it a model
  variant in `models.js` if you want a distinct shape.
- **New track:** change a mode's `track.control` in `config.js` (add a third
  value for altitude in the air). Keep the tightest radius above about 40 m on
  the ground and 130 m in the air, and sections well apart so edges don't cross.
- **New mode:** add an entry to `MODES`, machines with that `mode`, and a world
  builder registered in `src/world/index.js`.
- **Ideas:** time-trial ghost (record player state per frame), track
  selection, damage, police chases, online leaderboard.
