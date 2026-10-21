# Room page (`/room/`)

A fullscreen pixel-art 3D model of my bedroom with the four plants in it, plus a watering tracker. Clicking a plant opens a sidebar (a bottom sheet on phones) with its care info. The only other control is the time-of-day slider in the corner. Plain ES modules + three.js from jsDelivr; `build.py` copies `room/` to `_site/room/` as-is.

```
room/
├── index.html      page + styles
├── plants.json     the plants: names, care info, schedules, where they sit in the room
├── log.json        care events (written by the page, or by hand)
└── js/
    ├── main.js     boot, camera/orbit limits, picking, render loop
    ├── pixel.js    low-res render + outline/selection composite
    ├── mirror.js   the floor mirror's live reflection
    ├── room.js     the room, furniture, bay window (metres; facing the bay = -z)
    ├── flora.js    procedural plants + wind sway
    ├── wind.js     gust model + wind streaks from the open window
    ├── env.js      room clock, real sun position, sky, lamps, dust, sunbeams, weather looks
    ├── place.js    where the room is (rounded to ~1 km; drives the sun and the weather)
    ├── weather.js  live weather from Open-Meteo + how fast pots dry
    ├── care.js     schedule math (due / overdue / snooze / feeding)
    ├── store.js    loading + GitHub commits for the gardener
    └── ui.js       plant tags, sidebar, sign-in
```

## Logging care (gardener mode)

Visitors only read. To water from the page:

1. Create a [fine-grained token](https://github.com/settings/personal-access-tokens/new): repository access **only** `rahulaggarwal965.github.io`, permission **Contents → Read and write**, nothing else.
2. On `/room/`, click any plant, then **gardener sign-in** at the bottom of its sidebar, and paste it. It's stored in that browser's localStorage only.
3. Select a plant: **Water**, **Still damp** (pushes the next check back a few days), **Fed**, **Note…**. The "When" menu backdates (e.g. "yesterday").

Each action commits `room/log.json` to `main` (message like `[plants] water monstera`), which redeploys the site in about a minute; the page updates immediately for me. An undo link shows for a few seconds after each action. Because these commits land on `main`, **`git pull` before pushing local changes.**

Anything served from `rahulaggarwal965.github.io` shares that localStorage, so keep the token scoped to this one repo with only Contents access.

## Weather

`weather.js` pulls the current, hourly and daily weather from [Open-Meteo](https://open-meteo.com/) (free, no key, CC BY 4.0, credited in the sidebar), cached for 15 minutes in localStorage. It's used for two things:

- **The scene**: clouds and fog dim the direct sun and grey the sky outside, fog washes out the buildings, rain falls outside the windows, and the real wind speed sets how hard the breeze blows in. When the slider is moved off "now", the scene uses that hour's record/forecast for today.
- **Watering**: each plant's interval counts *typical* days. Every day since the last watering is weighted by that day's reference evapotranspiration (ET₀) against the 2015–2024 normal for the date here (√ratio, clamped to 0.7–1.4, because indoors is damped), so a hot sunny spell brings the next check forward and a foggy week pushes it back. The sidebar says how the weather has been and what it's doing to the schedule. Forecast days count too; days with no data count as typical.

If the weather can't be fetched (offline, blocked), everything falls back to the plain schedule and fair weather.

## Common edits

- **Move a plant** (e.g. onto the stand): edit its `position` `[x, y, z]` in `plants.json`. x runs bed wall (-1.675) to desk wall (1.675); z runs from the bay opening (-1.41; the bay's back window is at -2.46) to the closet wall (1.41; the door alcove goes back to 1.93); the desk top is y = 0.75. The three-tier bamboo stand in the bay is `PLANT_STAND` in `room.js` (trays at y = 0.71, 0.49, 0.08); a plant on it uses its tray's x, y, z. For a one-off stand under a single plant, set `"stand": 0.45` to draw a 45 cm stand and lift the plant.
- **Fix the room's dimensions**: they live at the top of `room.js` (`ROOM`, `BAY`, `SASH`, `BEAM`, `DESK`, `ALCOVE`, `CLOSET`). Width, depth and the bay's depth are tape measurements; the rest came from a structure-from-motion reconstruction of two walkthrough videos plus photos (COLMAP), scaled by the tape numbers and checked against an 80" door and a 20" box fan. The left side of the bay, the painting, the lantern and the stand were placed by solving the cameras of the October 20 daylight photos against the room (the bay's left edge sits about 0.76 m from the bed wall, with a 0.45 m straight return before the angled window). Walls, bay, closet, door, bed and nightstand follow the constants; the things on the desk, the bike, the mirror, and the plant positions in `plants.json` are absolute coordinates and may need a nudge after.
- **Change a schedule**: `water.every.growing` (Apr–Sep) / `water.every.rest` (Nov–Feb), in days; Mar and Oct use the midpoint. `water.snooze` is how far "Still damp" pushes the next check.
- **Add a plant**: add an entry to `plants.json` with `model` set to one of `strelitzia`, `monstera`, `philodendron`, `sansevieria` (closest look); new leaf shapes go in `flora.js`.
- **Fix a log entry**: edit `log.json` by hand. One event per line: `{"id", "plant", "type": water|feed|check|note, "at": ISO time, "note"?}`.

## Handy links

- `/room/#monstera` opens with a plant selected (ids are in `plants.json`).
- `/room/?weather=rain` (or `fog`, `cloudy`, `clear`) previews the room in that weather.
- `/room/?hour=21` opens the room at 9pm. Otherwise the sun follows the real time in `America/Los_Angeles` (`CLOCK` in `place.js`); the slider scrubs through the day and **now** goes back to live.
- `window.__room` in the console exposes the scene, camera, wind, etc. for poking around.

## Local preview

```
uv run python build.py && uv run python -m http.server -d _site 8000
```
then open http://localhost:8000/room/.
