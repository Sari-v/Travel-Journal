# Roadmap — from Paris app to full travel companion

This repo is designed to grow. Each item below is a self-contained module that can be added without breaking what's already there. Rough priority order (highest value first).

## Now (shipped)
- [x] Swipe deck of curated places (9 categories, 184 places)
- [x] Google ratings + "what reviewers say" + "don't miss" highlights
- [x] Voice guide (browser TTS reads each place's story)
- [x] GPS "Near Me" sorting + live distances
- [x] Map view with colour-coded pins + directions
- [x] Journal: proximity nudges, mood + note, structured export file
- [x] In-app guided walkthrough + "?" help
- [x] Apple-minimal "Paris" design, Wikipedia photos on cards

## Next — the framework (makes it multi-city & personal)
- [ ] **Multi-city packs** — generalise `data/paris-places.json` into `data/cities/<city>.json`; add a city picker; "add a city" becomes dropping in one file. Document the schema so AI can generate a new city (`add Tokyo` → research → `tokyo.json` → live).
- [ ] **`config.js`** — one file for all editable identity (app name, "Made for ___", category labels, accent colour). Rename without touching code.
- [ ] **PWA / offline** — installable to home screen + service worker so it works abroad with no signal. *Highest practical value for travel.*

## Then — the companion features
- [ ] **Photo journal** — attach photos to journal moments; store locally (IndexedDB) so it stays private and works offline.
- [ ] **End-of-trip journal generator** — turn the export file + photos into a beautiful illustrated, printable journal/scrapbook (the export → AI → keepsake pipeline).
- [ ] **Trip planner** — group saved places into day-by-day itineraries, auto-ordered by proximity & opening hours.
- [ ] **Calendar sync** — export itinerary to Google Calendar / `.ics`; optionally read existing events to avoid clashes.
- [ ] **Scheduler & reminders** — "leave now" alerts based on travel time; daily plan notifications.

## Later — nice-to-haves
- [ ] Budget tracker (per-trip spend, currency conversion)
- [ ] Packing list (per-trip, weather-aware)
- [ ] Weather + best-time-to-visit per place
- [ ] Metro / transit directions & offline transit map
- [ ] Shareable trips for travel companions (collaborative saves)
- [ ] "Places I've been" lifetime map + "on this day" memories
- [ ] Language phrasebook per city

## Architecture notes for future modules
- Keep the app a **single static site** (no required backend) as long as possible — all user data lives in the browser (localStorage / IndexedDB), so it stays private and host-agnostic.
- A backend only becomes necessary for: cross-device sync tied to a login, or server-side journal/photo generation. If added, use per-user auth + row-level security so a user only ever sees their own data.
- Data is content, code is the engine: a new city or category should be **data**, not new code.
