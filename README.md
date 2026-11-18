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

WASD walk, Shift sprint, Space jump, Ctrl walk slowly. **F** steals the car at the kerb
(or carjacks the traffic) and gets you out again; **V** switches to the close camera;
mouse looks (click to lock the pointer), wheel zooms. T skips an hour, P pauses, F3 frames.
Thirty traffic cars and thirty-two pedestrians work the streets around you; the HUD names
the district, the car and the speed.

Shot rig: `?shot=cover&seed=1`, `?shot=night&seed=1`, `?shot=drive&seed=1` (a stolen coupe
in the downtown traffic) and `?shot=street&seed=1` (on foot on the Neon Strip at dusk).

---

<sub>Entered on [make.fun](https://make.fun/?ref=dd12g1gh&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
