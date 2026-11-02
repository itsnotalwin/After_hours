# AFTERHOURS

A paper-cut isometric city that keeps living when you stop watching. You are not the main character. The city is.

**Phase 2b (this build): a full town.** The same 16×16-tile district now holds about 40 people in households, workplaces and retirement. The interface was rebuilt so that many people stay readable: a people list, rooftop numbers, a strip of live conversations and a calmer alert system. Everything from Phases 1 and 2 (paper city, camera, day/night, relationships, memory, speech bubbles, web, ledger, away report) is still here.

## Run it
- Quick look: open `dist/afterhours.html` (single file, no install, no offline mode).
- Real PWA: serve `dist/` from any static host (GitHub Pages, Netlify, or `python3 -m http.server` inside `dist/`). The service worker and install prompt only work over http(s).

## Deploy to GitHub Pages
Push the **contents of `dist/`** to a repo and enable Pages on that branch. Paths are relative, so it works under `/repo-name/`.
After any release, bump `VERSION` in `sw.js` so players get the new files (this build is `afterhours-v2b-town`).

## Develop
- Source lives in `src/` (no dependencies).
- `node tools/build.js` concatenates `src/*.js` into `dist/app.js` and rebuilds the single-file version.
- `python3 tools/icons.py` regenerates the PNG icons from `icon.svg` (needs Playwright).

| File | Job |
|---|---|
| `src/rng.js` | Seeded random numbers (mulberry32). One seed = one reproducible city. |
| `src/paper.js` | Isometric maths, palettes, halftone/hatch/grain textures, ink blobs. |
| `src/world.js` | Generates the district: streets, raised blocks, buildings with resident capacity (homes, flats) and job slots (workplaces), trees, lamps, pathfinding. |
| `src/art.js` | Draws everything procedurally: buildings, trees, paper board, backdrop, cut-paper people in four styles with accessories. |
| `src/dialogue.js` | Templated speech built from the kind of encounter, the speaker's strongest trait, how the pair feel about each other, a memory callback, and whether it is a routine or a chance meeting. No generated text. |
| `src/sim.js` | Clock, citizens, households and the **day ledger**. Each day is settled in order: plans come from memories and feelings, encounters are found where plans cross, outcomes change tomorrow. Within a day any moment is computed directly. It can also save and resume from a **snapshot**. Same seed = same history. |
| `src/main.js` | Camera, input, rendering, rooftop badges, speech bubbles, people list, citizen card, relationship web, ledger, away report, save/load, performance budget. |

## Controls
Drag to pan. Pinch or wheel to zoom. Tap a citizen (or a chip, or a row in the people list) to follow them and read their card: what they are doing, what they want, what is on their mind and how they feel about the people they know best. The `×` on the card closes it. Dragging the map lets go of a followed person.

- **People list** (button at the left of the strip, or `P`): everyone, searchable by name, job or home, with filters for Everyone, Talking, Outside and Trouble (anyone with bad blood or in a row), grouped by household when unfiltered. Tap a row to follow that person.
- **Rooftop numbers:** a building with one person inside shows their initial; two or more show a count. Tap the building: with one person inside you follow them, with several the people list opens filtered to that building, and an empty building tells you who lives or works there.
- **Strip:** up to six chips for conversations happening right now, red for arguments. Tap one to follow that pair. The row scrolls sideways.
- **Whole town:** the cube button zooms out to show the entire board. On a portrait phone the opening view is a closer crop of the middle, so the buildings stay legible, and the cube button is how you see every rooftop at once.
- **Keys:** arrows/WASD pan, `+`/`-` zoom, `]` or `N` next citizen, `[` or `B` previous, `P` people list, `F` follow, `Esc` clear or close.
- **Web** (who feels what about whom; filters All ties, Friends, Trouble) and **ledger** (everything that has happened, newest first; filters Everything, Rows, Warm, First meetings, and a "whose story" picker; tap a row to read what was said). Both scale to the whole cast: the web draws every pair that has met on a taller canvas, labels lines only for the pair you tap and names only where they fit, and the ledger shows the latest 120 rows with SHOW EARLIER for more.
- **Alerts:** red speech bubbles mark arguments. The red toast appears when the person whose card is open is in a row, and otherwise only for the most serious ones, with a cooldown (about one every four real minutes across the whole town). Everything else is still in the ledger.

When you return after time away (new visit, or switching back to the app) a report lists the biggest things that happened. Add `#fps` to the URL for a frame-time readout.

## Design decisions in force
Isometric. Paper craft, monochrome, red reserved for alerts (still used for conflict only). No time-speed controls: 1 in-game hour passes per real minute. Procedural art, no hand-drawn assets. Map is the primary UI.

## How the simulation works
- **Cast:** about 40 people. Roughly 15% are retired and 10% are between jobs (a freer day: more time in the park, café and street). The rest are spread over the workplaces by job slots. Homes have capacity, so most people live with housemates, who start out knowing each other. Colleagues also start out knowing each other.
- **Encounters:** two people are at the same indoor place, or within 1.4 tiles outdoors, for at least 6 minutes. Asleep at home does not count.
- **Conversations:** a person holds at most five a day, and only one at a time. Some are routine (the lunch crowd, colleagues, housemates) and read that way; chance meetings read differently.
- **Outcome:** argument, laugh, favour or chat, weighted by temper, sociability, current affinity and rivalry, and whether one of them is deliberately seeking the other.
- **Relationships:** directional affinity, trust and rivalry per pair, with diminishing returns near the limits and slow decay each night.
- **Memory:** each person keeps up to ten memories with a strength that fades about 14% a day. Memories change where they choose to spend time (they avoid places where they fought, return to places that went well) and what they say.
- **Lunch:** people at the same workplace often lunch together, more so if they get on.
- **Goals:** want company, want a word with a rival, want to get ahead, chasing money, want peace. Goals tilt their day plans.

## Saving, and why loading stays fast
- `afterhours.v1` holds the seed, the number of people, the game time and when you left. Away time counts one game minute per real second (capped at 30 days), so five real hours away is about 12 game days.
- With 40 people, replaying every day from day 0 takes about 6 to 7 ms a day on a desktop. That is fine early on and slow after a few hundred days. So the game also writes `afterhours.snap.v1` once per game day: the city's relationships and memories at the start of the current day, plus the event history. Loading resumes from it. Measured on a desktop: about 0.47 s at day 300 instead of 2.15 s, with identical results (checked by hashing the full state).
- Snapshots keep full dialogue only for recent days. Older events are kept as one-line records, newest 1,800.
- If a snapshot is missing, from another version or does not match the save, the game quietly falls back to replaying from day 0.
- **Old saves:** a save from the Phase 2 build loads the same seed, but world generation changed, so it is a different town. Use NEW CITY or clear site data for a clean start.

## Known limits
- Phone performance is measured only on a software renderer. A real-phone check is still owed.
- About ten arguments a day happen across 40 people. Toasts are gated, but the ledger lists all of them.
- Midnight settles the next day ahead of time (from 22:30), which can cost about one frame on a slow phone.
- A portrait phone leaves empty space above and below the board, which is wider than it is tall. The opening view crops the empty corners; the cube button shows the whole board, small.
