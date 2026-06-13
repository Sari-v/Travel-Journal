#!/usr/bin/env python3
"""Inject the place data into the HTML template -> app/index.html (the deployable file)."""
import json, pathlib
root = pathlib.Path(__file__).parent
data = json.load(open(root / 'data' / 'paris-places.json'))
tpl = (root / 'app' / 'template.html').read_text()
out = tpl.replace('/*__PLACES_DATA__*/', json.dumps(data, ensure_ascii=False))
(root / 'app' / 'index.html').write_text(out)
print(f"Built app/index.html with {data['meta']['count']} places.")
