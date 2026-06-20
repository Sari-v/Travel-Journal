#!/usr/bin/env python3
"""Build the deployable app: a small manifest-only index.html plus one JSON file
per city in app/cities/ that the app lazy-loads on demand (keeps the page fast).

Add a city: drop data/cities/<id>.json (same schema as paris.json) and add an
entry to data/cities/index.json, then run this script. See docs/ADD_A_CITY.md.
"""
import json, pathlib
root = pathlib.Path(__file__).parent
cdir = root / 'data' / 'cities'
appc = root / 'app' / 'cities'
appc.mkdir(exist_ok=True)
manifest = json.load(open(cdir / 'index.json'))['cities']
total = 0
keep = set()
for c in manifest:
    d = json.load(open(cdir / f"{c['id']}.json"))
    c['count'] = len(d['places'])
    total += len(d['places'])
    # one small file per city, loaded only when that city is opened
    (appc / f"{c['id']}.json").write_text(json.dumps({'places': d['places']}, ensure_ascii=False))
    keep.add(f"{c['id']}.json")
# prune city files no longer in the manifest
for f in appc.glob('*.json'):
    if f.name not in keep:
        f.unlink()
combined = {'manifest': manifest}   # NO place data baked into index.html
tpl = (root / 'app' / 'template.html').read_text()
out = tpl.replace('/*__PLACES_DATA__*/', json.dumps(combined, ensure_ascii=False))
(root / 'app' / 'index.html').write_text(out)
print(f"Built app/index.html (manifest only) + {len(manifest)} city files in app/cities/ — {total} places.")
