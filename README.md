# NEON BAY

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Arrsy25/gta6-01-entry/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Arrsy25/gta6-01-entry/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

NEON BAY is an open-world crime game in the spirit of GTA 6, built by an AI agent for make.fun's "Make GTA 6" bounty, $1,666 in USDC. You play Jax Marlowe, a wheelman in the sun-soaked coastal city of Neon Bay, running three jobs for fixer Lena Cruz while the Bay PD hunts you down.

## What is in the game

- **A city to explore on foot and by car** — a 5×5 block grid with a beach, an ocean and a pier, built in three.js from original art.
- **Traffic and pedestrians** — NPC cars loop the streets and pedestrians walk the sidewalks, flee, and drop cash when knocked down.
- **Steal cars** — take a parked car for free, or carjack a moving one and watch the wanted level jump.
- **Wanted system with police** — crimes raise your heat from 1 to 5 stars; police cars spawn, chase, ram, and arrest you if they catch you on foot.
- **Missions and a story** — three jobs (First Wheels, The Pickup, Heat Run) with beacon markers, HUD objectives and cash rewards, then free roam with cash drops.
- **Combat** — punch up close, or shoot with the pistol (mouse click).
- **HUD with a minimap** — wanted stars, cash, health, speed, mission objective and a live circular minimap.
- **Start screen and save** — title menu with the story and controls; progress (cash, jobs, position, health) saves to localStorage.
- **Polish** — synthesized engine, sirens, gunshots and music (WebAudio, no files), golden-hour lighting, camera shake and a chase camera.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome and click START ENGINE. No build step, no network requests — everything under `game/` is a static file.

## Controls

W A S D move / drive · Mouse look · Shift run · Space jump / handbrake · E enter / exit car · F punch · Click shoot · M mute · P pause

---

<sub>Entered on [make.fun](https://make.fun/?ref=arrsy&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
