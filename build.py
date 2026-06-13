#!/usr/bin/env python3
"""Bundle every city pack + manifest into the deployable app/index.html.

Add a city: drop data/cities/<id>.json (same schema as paris.json) and add an
entry to data/cities/index.json, then run this script. See docs/ADD_A_CITY.md.
"""
import json, pathlib
root = pathlib.Path(__file__).parent
cdir = root / 'data' / 'cities'
manifest = json.load(open(cdir / 'index.json'))['cities']
cities = {}
for c in manifest:
    d = json.load(open(cdir / f"{c['id']}.json"))
    cities[c['id']] = {'places': d['places']}
    c['count'] = len(d['places'])
combined = {'manifest': manifest, 'cities': cities}
tpl = (root / 'app' / 'template.html').read_text()
out = tpl.replace('/*__PLACES_DATA__*/', json.dumps(combined, ensure_ascii=False))
(root / 'app' / 'index.html').write_text(out)
total = sum(len(v['places']) for v in cities.values())
print(f"Built app/index.html — {total} places across {len(manifest)} cit{'y' if len(manifest)==1 else 'ies'}.")
