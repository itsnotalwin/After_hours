# AFTERHOURS

A paper-cut isometric city that keeps living when you stop watching. You are not the main character. The city is.

**Phase 2 (this build):** citizens now notice each other, build friendships and rivalries, remember what happened, talk in speech bubbles, and the city keeps a ledger you can read. Everything from Phase 1 (paper city, camera, day/night, catch-up) is still here.

## Run it
- Quick look: open `dist/afterhours.html` (single file, no install, no offline mode).
- Real PWA: serve `dist/` from any static host (GitHub Pages, Netlify, or `python3 -m http.server` inside `dist/`). The service worker and install prompt only work over http(s).

## Deploy to GitHub Pages
Push the **contents of `dist/`** to a repo and enable Pages on that branch. Paths are relative, so it works under `/repo-name/`.
After any release, bump `VERSION` in `sw.js` so players get the new files.

## Develop
- Source lives in `src/` (no dependencies).
- `node tools/build.js` concatenates `src/*.js` into `dist/app.js` and rebuilds the single-file version.
- `python3 tools/icons.py` regenerates the PNG icons from `icon.svg` (needs Playwright).

| File | Job |
|---|---|
| `src/rng.js` | Seeded random numbers (mulberry32). One seed = one reproducible city. |
| `src/paper.js` | Isometric maths, palettes, halftone/hatch/grain textures, ink blobs. |
| `src/world.js` | Generates the district: streets, raised blocks, buildings, trees, lamps, pathfinding. |
| `src/art.js` | Draws everything procedurally: buildings, trees, paper board, backdrop, cut-paper people. |
| `src/dialogue.js` | Templated speech built from the kind of encounter, the speaker's strongest trait, how the pair feel about each other, and a memory callback. No generated text. |
| `src/sim.js` | Clock, citizens and the **day ledger**. Each day is settled in order: plans come from memories and feelings, encounters are found where plans cross, outcomes change tomorrow. Within a day any moment is computed directly. Same seed = same history. |
| `src/main.js` | Camera, input, rendering, speech bubbles, citizen card, relationship web, ledger, away report, save/load, performance budget. |

## Controls
Drag to pan. Pinch or wheel to zoom. Tap a citizen (or a chip) to follow them and read their card: what they are doing, what they want, what is on their mind and how they feel about each other person. Dragging the map lets go. Keys: arrows/WASD pan, `+`/`-` zoom, `1-3` pick a citizen, `F` follow, `Esc` clear.

Two buttons on the right: the **web** (who feels what about whom; tap a person or a line to see the memories behind it) and the **ledger** (everything that has happened, newest first; tap a row to read what was said). A red toast and red speech bubbles mark arguments. Tap the toast to go to the scene.

When you return after time away (new visit, or switching back to the app) a report lists the biggest things that happened. Add `#fps` to the URL for a frame-time readout.

## Design decisions in force
Isometric. Paper craft, monochrome, red reserved for alerts (now used for conflict only). No time-speed controls: 1 in-game hour passes per real minute. Procedural art, no hand-drawn assets. Map is the primary UI.

## How the simulation works (Phase 2)
- **Encounters:** two people are at the same indoor place, or within 1.4 tiles outdoors, for at least 6 minutes.
- **Outcome:** argument, laugh, favour or chat, weighted by temper, sociability, current affinity and rivalry, and whether one of them is deliberately seeking the other.
- **Relationships:** directional affinity, trust and rivalry per pair, with diminishing returns near the limits and slow decay each night.
- **Memory:** each person keeps up to ten memories with a strength that fades about 14% a day. Memories change where they choose to spend time (they avoid places where they fought, return to places that went well) and what they say.
- **Goals:** want company, want a word with a rival, want to get ahead, chasing money, want peace. Goals tilt their day plans.
- **Catch-up:** days are replayed from day 0 on load (about 1 ms a day), so a save is only a seed and a time.
