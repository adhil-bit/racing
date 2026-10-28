# Apex Rush

Night-city arcade racer for the browser. Pick a car or a superbike and race five
rivals over three laps of a 3.6 km street circuit. Built with Three.js and Vite,
no image or sound assets: every texture is drawn on a canvas at boot and every
sound is synthesised with Web Audio, so the whole game ships as one ~140 kB
(gzipped) bundle.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build -> dist/
npm run build:single   # everything inlined -> dist-single/index.html
```

## Controls

Auto-accelerate is on by default: the car is always on full gas and braking
takes over while you hold a brake key. Turn it off in the garage to drive with
manual throttle (↑ / W, RT, or the Gas button). The choice is remembered.

| Action | Keyboard | Gamepad | Touch |
| --- | --- | --- | --- |
| Brake | ↓ or S | LT | Brake |
| Brake + drift (rear grip drops) | Space | X | Drift |
| Steer | ← → or A D | Left stick | ◀ ▶ |
| Nitro | Shift | A | Nitro |
| Throttle (manual mode only) | ↑ or W | RT | Gas |
| Camera (chase, far, cockpit) | C | Y | Camera |
| Recover onto track | R | B | — |
| Pause | Esc or P | Start | Pause |
| Mute | M | — | Sound |

Nitro drains while held and refills slowly on its own, and much faster while drifting.

## Architecture

```
src/
├─ main.js               entry: boots Game, shows a WebGL error if it can't
├─ config.js             every tunable number: vehicles, laps, track width, camera
├─ core/
│  ├─ Game.js            state machine + main loop, camera rig, collisions, laps, results
│  ├─ Input.js           keyboard + gamepad + touch -> one normalised control object
│  └─ AudioEngine.js     synthesised engine, nitro, tyre squeal, impacts
├─ world/
│  ├─ Track.js           spline centreline, arc-length samples, projection, curvature
│  ├─ Environment.js     road/curb/wall ribbons, lamps (instanced), merged city, sky
│  └─ textures.js        canvas-generated textures
├─ vehicles/
│  ├─ models.js          procedural car + bike meshes, shared per-frame animation
│  └─ Vehicle.js         player physics
├─ ai/
│  └─ AIRacer.js         AI drivers
├─ fx/
│  └─ Particles.js       pooled tyre smoke and sparks
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
- **New track:** change `CONTROL` in `Track.js`. Keep the tightest radius above
  about 40 m and sections at least 60 m apart so walls don't intersect.
- **Ideas:** time-trial ghost (record player state per frame), track
  selection, damage, police chases, online leaderboard.
