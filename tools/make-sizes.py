#!/usr/bin/env python3
"""Gera versões leves das fotos e registra no galleries.json.

Para cada foto em images/<galeria>/ cria:

  images/<galeria>/thumbs/<nome>.jpg   700 px  — usada no grid e na capa
  images/<galeria>/view/<nome>.jpg    1800 px  — usada no lightbox

O arquivo original continua sendo o do botão "Baixar". Isso evita que o
celular baixe dezenas de fotos de 5 MB só para mostrar o grid.

Uso:  python3 tools/make-sizes.py
Requer Pillow:  pip3 install Pillow
"""

import json
import os
import sys

from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES_DIR = os.path.join(ROOT, "images")
MANIFEST = os.path.join(ROOT, "galleries.json")

SIZES = [
    ("thumbs", 700, 80),
    ("view", 1800, 85),
]


def derive(src, dest, max_side, quality):
    """Cria dest a partir de src, se ainda não existir ou estiver desatualizado."""
    if os.path.exists(dest) and os.path.getmtime(dest) >= os.path.getmtime(src):
        return False

    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im)          # respeita a orientação da câmera
        im = im.convert("RGB")
        im.thumbnail((max_side, max_side), Image.LANCZOS)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        im.save(dest, "JPEG", quality=quality, optimize=True, progressive=True)
    return True


def main():
    with open(MANIFEST, encoding="utf-8") as fh:
        data = json.load(fh)

    created = 0
    total_src = 0
    total_new = 0

    for gallery in data.get("galleries", []):
        for photo in gallery.get("photos", []):
            src = os.path.join(ROOT, photo["file"])
            if not os.path.exists(src):
                print(f"  faltando: {photo['file']}")
                continue

            folder, name = os.path.split(photo["file"])
            stem = os.path.splitext(name)[0]
            total_src += os.path.getsize(src)

            for sub, max_side, quality in SIZES:
                rel = f"{folder}/{sub}/{stem}.jpg"
                dest = os.path.join(ROOT, rel)
                if derive(src, dest, max_side, quality):
                    created += 1
                photo["thumb" if sub == "thumbs" else "view"] = rel
                total_new += os.path.getsize(dest)

        # A capa aponta para o original; o site usa a miniatura correspondente
        if gallery.get("photos") and not gallery.get("cover"):
            gallery["cover"] = gallery["photos"][0]["file"]

    with open(MANIFEST, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    mb = lambda b: f"{b / 1024 / 1024:.1f} MB"
    print(f"{created} arquivo(s) gerado(s).")
    print(f"originais: {mb(total_src)} · versões leves: {mb(total_new)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
