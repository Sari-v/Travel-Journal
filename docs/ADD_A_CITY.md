# Adding a city

The app is a framework: a city is **data, not code**. To add a trip, drop one JSON file in `data/cities/`, add a line to the manifest, run the build, and push. The new city appears in the in-app picker (tap the wordmark).

## The fast way: ask Claude

Just say: **"Add Tokyo to Meraki Travels."**

Claude will: research the city's best places across all 9 categories, write `data/cities/tokyo.json` in the exact schema below, add it to `data/cities/index.json`, run `python3 build.py`, and commit. On push, Vercel auto-deploys and the city shows up in the picker.

## Manual steps

1. Create `data/cities/<id>.json` (lowercase id, e.g. `tokyo`) using the schema below.
2. Add an entry to `data/cities/index.json` → `cities` array.
3. Run `python3 build.py`.
4. `git add -A && git commit -m "Add <City>" && git push` → auto-deploys.

## Manifest entry (`data/cities/index.json`)

```json
{
  "id": "tokyo",
  "name": "Tokyo",
  "country": "Japan",
  "emoji": "🇯🇵",
  "center": [35.6762, 139.6503],
  "tagline": "One line describing the city's character."
}
```
`center` is `[lat, lng]` — the map's starting view. `count` is filled in automatically by `build.py`.

## City file schema (`data/cities/<id>.json`)

```json
{
  "meta": { "city": "Tokyo", "count": 0 },
  "places": [
    {
      "id": "food-01",
      "category": "food",
      "subcategory": "ramen",
      "name": "Place Name",
      "neighborhood": "District, ward",
      "address": "Full street address",
      "lat": 35.6895,
      "lng": 139.6917,
      "price": "¥ — short note",
      "googleRating": 4.6,
      "googleReviewCount": 3200,
      "reviewSummary": "1–2 sentences: what it is, why go.",
      "googleReviewSummary": "1 sentence: what reviewers consistently say (praise + a caveat).",
      "localTip": "One practical insider tip.",
      "story": "2–3 vivid spoken-style sentences of history + a cool fact, written to be read aloud by the voice guide.",
      "highlight": "(optional) short 'Don't miss' line — used mainly for arts/landmarks."
    }
  ]
}
```

### Rules
- `id` is **local to the city** (e.g. `food-01`). The app namespaces it to `tokyo/food-01` automatically, so ids only need to be unique *within* the file.
- `category` must be one of: `food`, `cafe`, `touristy`, `local`, `experience`, `arts`, `music`, `workshop`, `photo`. (To add a new category, also add it to the `CATS` object in `app/template.html`.)
- Every field above is expected on every place except `highlight` (optional).
- `lat`/`lng` must be real coordinates (4+ decimals). The card photo is fetched live from Wikipedia by name, with a graceful fallback — no image field needed.
- Keep `story` accurate and warm; it's the voice-guide script.

That's it. Same shape as `data/cities/paris.json` — copy that file as a starting template.
