# AFTERHOURS — build phases

## Phase 1 — The paper city (built)
Isometric paper-craft district from a seed. Free camera (drag, pinch, wheel) plus follow mode. Three citizens with traits, homes, jobs and full daily timelines (work, lunch, evening, sleep, weekends). Day/night as an ink inversion. Catch-up while away. Specimen sheet for reviewing generated art. Installable PWA, offline.

## Phase 2 — Memory and relationships (built)
Citizens notice each other when paths cross. Affinity, trust and rivalry between every pair. A memory log with salience that decays. Templated speech bubbles built from trait, relationship and memory fields. First red-alert styling for conflict. "While you were away" becomes a real list of what happened.

Also shipped: a day ledger so history compounds, goals and needs that tilt each day's plan, a relationship web with the memories behind each tie, a ledger overlay with the dialogue, red conflict toast, return-to-app away report, and a phone performance budget (offscreen culling, sprite warm-up behind the cover, adaptive resolution).

## Phase 2b — A full town (built)
Requested after Phase 2: grow the city "exponentially". Scoped with the owner to about 40 people, more people and homes, in the same 16×16 district (not more map, not more businesses yet).

Engine: households (homes with capacity, housemates start out knowing each other), workplaces with job slots (colleagues too), about 15% retired and 10% between jobs, lunch buddies, a cap of five conversations a person a day, routine versus chance conversations with matching dialogue, park spots that do not stack people on one tile. Typical city: 15–19 buildings, 9 homes, 6–8 workplaces, 47–60 beds.

Interface: a people list (search, filters, household groups, per-building view), rooftop initials and counts, a strip of live conversations, bubble de-overlap with a cap by zoom, name labels at close zoom, a close button on the citizen card, a web and ledger that scale to 40 (filters, day counts, SHOW EARLIER), and a calmer alert system (about one toast per four real minutes citywide).

Platform: day snapshots so a long-running city loads in about half a second instead of replaying every day from day 0 (resume is byte-identical, verified by state hash). Cut-paper figures now come in four styles, nine accessories and three sizes, so forty people do not look like three.

Known gaps: phone speed only measured on a software renderer; old Phase 2 saves load a different town (world generation changed); older ledger rows keep only one-line summaries after the newest 1,800 events.

## Phase 3 — The three verbs
Whisper (seed a rumour that spreads and distorts), Fund/Withdraw (change a business's odds), Introduce (connect two people). One direct intervention per in-game week with a visible cost to city stability. The city pulse meters (stability, tension, prosperity) arrive here. Open decision: verbs as buttons or as map gestures.

## Phase 4 — Businesses and events
Business capital, revenue, reputation and lifecycle (open, expand, struggle, fail or sell). Weather, festivals, closures and economic shifts weighted by city pulse. Red alert threshold on tension.

## Phase 5 — Crime, secrets, scale
Crime and investigation. Hidden secrets revealed by gossip. Grow past 40 people and add a second district, with the simulation moved off the main thread so phones keep up.

## Phase 6 — History
Gazette as a secondary archive of each week's notable events. Playthrough history. Save migration with IndexedDB (the localStorage snapshot is the stopgap until then). Polish and tuning pass on event probabilities.
