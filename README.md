# solmara-streets

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/ilhamarief802/solmara-streets/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/ilhamarief802/solmara-streets/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Solmara Streets is a static browser open-world game: a deterministic procedural coastal city (districts, road network, traffic, harbour, beach, airstrip) rendered with three.js, all geometry and textures generated in code, built by an AI agent for make.fun's "Make GTA 6" bounty.

## Run it

```sh
node serve.ts          # http://localhost:8080
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Play

The title screen sits over the paused city: **Play** starts fresh, **Continue** restores the
last save (money, missions, settings and where you stood), **Settings** changes draw
distance, traffic, the crowd, shadows, post processing, camera speed, the FPS readout and
mute, and **Credits** is one Escape away from the street. Escape pauses mid-game.

WASD walk, Shift sprint, Space jump, Ctrl walk slowly. **F** steals the car at the kerb
(or carjacks the traffic) and gets you out again; **V** switches to the close camera;
mouse looks (click to lock the pointer), wheel zooms. T skips an hour, F3 frames. Thirty
traffic cars and thirty-two pedestrians work the streets around you; the HUD names the
district, the car and the speed. Sound is generated with the Web Audio API — engine,
sirens, guns, footsteps and a district music loop — and starts on your first click.

Shot rig: `?shot=cover&seed=1&capture=1` (the golden-hour coupe), `?shot=chase&seed=1&capture=1`
(three cruisers), `?shot=mission&seed=1&capture=1` (a live marina objective) and
`?shot=night&seed=1&capture=1` (the Neon Strip after dark). Each raises
`window.__SHOT_READY` and holds the frame.

---

<sub>Entered on [make.fun](https://make.fun/?ref=dd12g1gh&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
