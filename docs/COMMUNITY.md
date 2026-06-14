# Becoming a community app

Goal: let anyone **add their own places** (name, photo, coordinates), publish **journals and itineraries** for a city, and let others **experience those itineraries, comment, and like** them (likes only — no dislikes, by design).

This is the planned "backend transition" from the roadmap. The trick is to get there in shippable steps without breaking the static, offline-first app that already works.

## Turn it on (≈5 minutes)

Everything below is **already built** in the app. It runs fully local until you connect Supabase. To switch on accounts, cloud places, shared itineraries, likes and comments:

1. Create a free project at **supabase.com**.
2. **SQL Editor** → paste the contents of `supabase/migrations/0001_init.sql` → **Run**. (Creates all tables, RLS, triggers, and the `photos` storage bucket.)
3. **Project Settings → API** → copy the **Project URL** and **anon public** key.
4. Paste both into `app/config.js`:
   ```js
   window.MERAKI_CONFIG = {
     supabaseUrl: 'https://YOURPROJECT.supabase.co',
     supabaseAnonKey: 'eyJhbGci...'
   };
   ```
5. Enable the sign-in methods you want under **Authentication → Providers** (email magic-link is on by default):
   - **Google** — create an OAuth client in Google Cloud, paste client ID + secret into the Google provider.
   - **Apple** — needs an Apple Developer account: a Services ID, a Sign-in-with-Apple key, and your team/key IDs, pasted into the Apple provider. Add your domain to the return URLs.
   - **Phone (SMS)** — enable the Phone provider and connect an SMS sender (Twilio, MessageBird, Vonage, or Twilio Verify) under Authentication → Providers → Phone. Without an SMS provider the "Text me a code" button will error.
6. Commit + push. Vercel redeploys; the city sheet now shows "Sign in to sync & share", and added places/itineraries go to the cloud for everyone.

The auth sheet offers **Google, Apple, phone (SMS code), and email magic-link**. Each button only works once its provider is enabled above; the others still work independently.

The anon key is safe to ship in a static client — Row-Level Security (below) is what actually guards the data. Leave `config.js` blank to keep the app fully local (Add-a-place still works, stored on-device).

## Guiding principle (unchanged)

> Data is content, code is the engine.

Today every place is **baked into `index.html` at build time** by `build.py`. To become a community app, places, photos, itineraries and comments must be **read and written at runtime** from a shared backend — while the curated city packs stay as the offline seed/fallback.

## The one big decision: backend

A community needs shared, persistent, per-user data + photo hosting + auth. Recommended: **Supabase** (Postgres + Auth + Storage + Row-Level Security + Realtime). It matches the rest of your stack, the free tier covers an MVP, and RLS gives us "everyone reads published content, you can only edit your own" without writing a server.

The app stays a static site (Vercel) and talks to Supabase directly from the browser via `supabase-js` (CDN). No server to run.

## Phased plan

### Phase 1 — "Add your own place" (local-first, no backend, ships today)
The first community brick that needs zero infrastructure and sets the exact data shape for everything later.

- A **`+ Add place`** button → sheet with: name, category (incl. Nightlife), neighborhood, address, **coordinates** (auto-fill from current GPS, or drop a pin on the map), **photo** (camera/upload), price, your note/story.
- Stored in `localStorage` / IndexedDB as user places (`pe_myplaces`), photos as blobs in IndexedDB.
- Merged into the deck/map/saved with an `author: 'me'` + `source: 'community'` flag and a small "Added by you" badge.
- Included in the existing **Export** file.
- **Why first:** works offline, no signup, immediate value — and the object it writes is byte-for-byte the row we'll later sync to Supabase. Nothing is throwaway.

### Phase 2 — Accounts + cloud sync (Supabase)
- Supabase **Auth** (email magic-link or Google). A lightweight "sign in to sync & share" sheet.
- Create tables + Storage bucket (schema below). On first login, **push** the user's local places/journal up (their Phase-1 data becomes their seed).
- App load becomes: fetch curated seed (static) + community content (Supabase), merge. Offline still works from the static seed + IndexedDB cache.

### Phase 3 — Community itineraries
- Users build an **itinerary**: an ordered, day-by-day list of places for a city (generalises the curated "Suggested itinerary" we just added).
- Publish it; others browse a city's itineraries, **save/"experience"** one (it drops those stops into their deck/map), and walk it with the voice guide.
- Curated itineraries = `source: 'official'`; user ones = `source: 'community'`.

### Phase 4 — Social: likes + comments (no dislikes)
- **Likes** (single direction) on places, itineraries, and shared journal moments. A like count, and "popular this month" sorting.
- **Comments** on itineraries (threaded-lite). Positive-only: no dislike, but a quiet **Report** action for moderation.

### Phase 5 — Polish
Profiles + follow, notifications, PWA offline upgrade, photo moderation/queue, "places I've been" lifetime map.

## Data model (Supabase / Postgres) — sketch

```
profiles(id uuid pk → auth.users, handle, display_name, avatar_url, created_at)

cities(id text pk, name, country, emoji, center_lat, center_lng,
       tagline, best_time, created_at)            -- manifest moves to DB (static stays as seed)

places(id uuid pk, city_id text, category, subcategory, name, neighborhood,
       address, lat, lng, price, google_rating, google_review_count,
       review_summary, google_review_summary, local_tip, story, highlight,
       source text check (source in ('curated','community')),
       author_id uuid, status text check (status in ('published','pending','hidden')),
       like_count int default 0, created_at)

place_photos(id uuid pk, place_id uuid, url, author_id uuid, created_at)

itineraries(id uuid pk, city_id text, author_id uuid, title, summary,
            days int, source text, is_published bool, like_count int, created_at)
itinerary_stops(id uuid pk, itinerary_id uuid, day int, position int,
                place_id uuid, note)

moments(id uuid pk, author_id uuid, city_id text, place_id uuid, body, mood,
        happened_at, is_public bool default false, like_count int, created_at)
moment_photos(id uuid pk, moment_id uuid, url, created_at)

comments(id uuid pk, target_type text check (target_type in ('itinerary','place','moment')),
         target_id uuid, author_id uuid, body, created_at)

likes(id uuid pk, target_type text, target_id uuid, user_id uuid, created_at,
      unique(target_type, target_id, user_id))     -- like_count kept in sync by trigger

reports(id uuid pk, target_type text, target_id uuid, reporter_id uuid, reason, created_at)
```

Row-Level Security:
- `select`: anyone may read rows that are `published` / `is_public`.
- `insert`/`update`/`delete`: only `author_id = auth.uid()`.
- `likes` / `comments`: insert allowed for any authenticated user; delete only your own.
- No `dislike` table exists — the schema makes negativity impossible, not just hidden.

Photos: a public-read Supabase **Storage** bucket; the app uploads, stores the URL in `*_photos`.

## Frontend changes (incremental, not a rewrite)

- Keep `build.py` + city JSON as the **curated seed / offline fallback**.
- Add `supabase-js` (CDN) and a thin `db.js`: `getPlaces(city)`, `addPlace()`, `uploadPhoto()`, `getItineraries(city)`, `like(target)`, `comment(target)`.
- New UI sheets, each self-contained like today's journal sheet: **Auth**, **Add place**, **Itinerary builder**, **Comments**, plus like buttons.
- The existing `ALL[city]` place array just becomes `curatedSeed[city] + communityPlaces[city]` — the deck, map, filters, and itinerary card already consume that array unchanged.

## What stays true
- Still a static site on Vercel; Supabase is the only added dependency.
- Still works offline from the seed + local cache.
- A new curated city is still just data (`data/cities/<id>.json` → `build.py`).
- Likes only. Always.
