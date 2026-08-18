#!/usr/bin/env python3
"""Varre images/<galeria>/ e atualiza galleries.json.

Serve para quando você copia fotos direto na pasta, em vez de usar a página
de upload (/upload/). O que já está preenchido no manifesto é preservado.

- Cada subpasta de images/ vira uma galeria.
- Fotos novas entram no fim da galeria com metadados em branco.
- Entradas cujo arquivo sumiu do disco são removidas.
- Galerias que ficaram sem foto alguma são removidas do manifesto.

Uso:  python3 tools/gen-manifest.py
"""

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES_DIR = os.path.join(ROOT, "images")
MANIFEST = os.path.join(ROOT, "galleries.json")

EXTS = {".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"}


def natural_key(name):
    """Ordena foto2 antes de foto10."""
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", name)]


def exif_date(path):
    """DateTimeOriginal do EXIF, em timestamp. 0 se não houver."""
    try:
        from PIL import Image
    except ImportError:
        return 0
    try:
        with Image.open(path) as im:
            raw = im.getexif().get_ifd(0x8769).get(0x9003)
        if not raw:
            return 0
        import datetime
        return datetime.datetime.strptime(raw, "%Y:%m:%d %H:%M:%S").timestamp()
    except Exception:
        return 0


def photo_key(folder, name):
    """Ordem da galeria: data da foto (mais antiga primeiro), depois nome."""
    path = os.path.join(folder, name)
    ts = exif_date(path)
    if not ts:
        try:
            ts = os.path.getmtime(path)
        except OSError:
            ts = 0
    return (ts, natural_key(name))


def pretty(name):
    stem = os.path.splitext(name)[0]
    stem = re.sub(r"[_-]+", " ", stem).strip()
    return stem[:1].upper() + stem[1:] if stem else name


def list_images(folder):
    return sorted(
        (f for f in os.listdir(folder)
         if os.path.splitext(f)[1].lower() in EXTS and not f.startswith(".")),
        key=lambda name: photo_key(folder, name),
    )


def main():
    if not os.path.isdir(IMAGES_DIR):
        os.makedirs(IMAGES_DIR)
        print("Criei images/ — crie uma subpasta por galeria e rode de novo.")
        return 0

    with open(MANIFEST, encoding="utf-8") as fh:
        data = json.load(fh)

    site = data.get("site", {})
    known = {g["id"]: g for g in data.get("galleries", []) if g.get("id")}

    folders = sorted(
        (d for d in os.listdir(IMAGES_DIR)
         if os.path.isdir(os.path.join(IMAGES_DIR, d)) and not d.startswith(".")),
        key=natural_key,
    )

    galleries, added, removed = [], 0, 0

    for folder in folders:
        files = list_images(os.path.join(IMAGES_DIR, folder))
        if not files:
            continue

        gallery = known.get(folder, {
            "id": folder,
            "name": pretty(folder),
            "description": "",
            "createdAt": "",
            "cover": "",
            "photos": [],
        })

        existing = {p["file"]: p for p in gallery.get("photos", []) if p.get("file")}
        photos = []

        for name in files:
            path = f"images/{folder}/{name}"
            if path in existing:
                photos.append(existing[path])
            else:
                photos.append({
                    "file": path,
                    "title": pretty(name),
                    "author": "",
                    "year": site.get("defaultYear", ""),
                    "license": "",
                    "location": "",
                    "alt": "",
                })
                added += 1

        removed += len(existing) - sum(1 for p in photos if p["file"] in existing)

        gallery["photos"] = photos
        if not gallery.get("cover") or gallery["cover"] not in {p["file"] for p in photos}:
            gallery["cover"] = photos[0]["file"]
        galleries.append(gallery)

    dropped = [gid for gid in known if gid not in {g["id"] for g in galleries}]

    data["site"] = site
    data["galleries"] = galleries

    with open(MANIFEST, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    total = sum(len(g["photos"]) for g in galleries)
    print(f"galleries.json atualizado: {len(galleries)} galeria(s), {total} foto(s) "
          f"(+{added} nova(s), -{removed} removida(s))")
    for gid in dropped:
        print(f"  galeria removida do manifesto (pasta vazia ou ausente): {gid}")
    if added:
        print("Preencha 'author' e 'title' das novas entradas em galleries.json.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
