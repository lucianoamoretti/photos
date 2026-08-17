#!/usr/bin/env python3
"""Varre images/ e atualiza photos.json.

- Fotos novas entram no fim da lista com metadados em branco.
- Metadados já preenchidos (title, author, year, license, location, alt) são preservados.
- Entradas cujo arquivo sumiu de images/ são removidas.

Uso:  python3 tools/gen-manifest.py
"""

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES_DIR = os.path.join(ROOT, "images")
MANIFEST = os.path.join(ROOT, "photos.json")

EXTS = {".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"}


def natural_key(name):
    """Ordena foto2 antes de foto10."""
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", name)]


def pretty_title(filename):
    stem = os.path.splitext(filename)[0]
    stem = re.sub(r"[_-]+", " ", stem).strip()
    return stem[:1].upper() + stem[1:] if stem else filename


def main():
    if not os.path.isdir(IMAGES_DIR):
        os.makedirs(IMAGES_DIR)
        print("Criei images/ — coloque as fotos lá e rode de novo.")
        return 0

    files = sorted(
        (f for f in os.listdir(IMAGES_DIR)
         if os.path.splitext(f)[1].lower() in EXTS and not f.startswith(".")),
        key=natural_key,
    )

    with open(MANIFEST, encoding="utf-8") as fh:
        data = json.load(fh)

    site = data.get("site", {})
    existing = {p["file"]: p for p in data.get("photos", []) if p.get("file")}

    photos = []
    for name in files:
        path = "images/" + name
        if path in existing:
            photos.append(existing[path])
        else:
            photos.append({
                "file": path,
                "title": pretty_title(name),
                "author": "",
                "year": site.get("defaultYear", ""),
                "license": "",
                "location": "",
                "alt": "",
            })

    removed = [p for p in existing if p not in {x["file"] for x in photos}]

    data["site"] = site
    data["photos"] = photos

    with open(MANIFEST, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    added = len(photos) - (len(existing) - len(removed))
    print(f"photos.json atualizado: {len(photos)} fotos "
          f"(+{added} nova(s), -{len(removed)} removida(s))")
    if added:
        print("Preencha 'author' e 'title' das novas entradas em photos.json.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
