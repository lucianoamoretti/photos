#!/usr/bin/env python3
"""Gera g/<id>/index.html — uma página por galeria, com as tags de preview.

WhatsApp, Instagram, Slack e afins não rodam JavaScript: leem só o HTML cru.
Como gallery.html é a mesma página para todas as galerias, o preview do link
saía sempre com o mesmo título. Cada galeria ganha uma página própria, feita a
partir de gallery.html com <base>, <title> e as tags Open Graph já escritas.

A página de upload e a de edição fazem isso sozinhas (assets/js/pagegen.js);
este script serve para regerar tudo de uma vez.

Uso:  python3 tools/gen-pages.py
"""

import datetime
import html
import json
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, "galleries.json")
TEMPLATE = os.path.join(ROOT, "gallery.html")
PAGES_DIR = os.path.join(ROOT, "g")


def format_date(iso):
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", iso or "")
    if not m:
        return ""
    d = datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    return f"{d.day} {d.strftime('%B')} {d.year}"


def cover_image(gallery):
    photos = gallery.get("photos", [])
    cover = next((p for p in photos if p["file"] == gallery.get("cover")), None)
    if cover is None and photos:
        cover = photos[0]
    return (cover.get("thumb") or cover["file"]) if cover else ""


def description(gallery):
    photos = gallery.get("photos", [])
    bits = []
    if gallery.get("date"):
        bits.append(format_date(gallery["date"]))
    bits.append(f"{len(photos)} photo" + ("" if len(photos) == 1 else "s"))
    author = photos[0].get("author") if photos else ""
    if author:
        bits.append(f"by {author}")
    text = " · ".join(bits)
    return f"{gallery['description']} — {text}" if gallery.get("description") else text


def build(template, site, gallery):
    site_name = site.get("title") or "Gallery"
    name = gallery.get("name") or gallery["id"]
    base_url = (site.get("url") or "").rstrip("/")
    page_url = f"{base_url}/g/{gallery['id']}/"
    private = gallery.get("visibility") == "private"
    # Privada: nada de capa no preview nem no índice do Google — quem tem o
    # link vê o nome, e só isso sai daqui.
    desc = "Private gallery." if private else description(gallery)
    image = "" if private else cover_image(gallery)
    e = html.escape

    head = [
        '<base href="../../">',
        f'<link rel="canonical" href="{e(page_url)}">',
        f'<meta name="description" content="{e(desc)}">',
        '<meta property="og:type" content="website">',
        f'<meta property="og:site_name" content="{e(site_name)}">',
        f'<meta property="og:title" content="{e(name)}">',
        f'<meta property="og:description" content="{e(desc)}">',
        f'<meta property="og:url" content="{e(page_url)}">',
    ]
    if image:
        head += [
            f'<meta property="og:image" content="{e(base_url)}/{e(image)}">',
            f'<meta property="og:image:alt" content="{e(name)}">',
        ]
    if private:
        head.append('<meta name="robots" content="noindex, nofollow, noarchive">')

    head += [
        '<meta name="twitter:card" content="summary_large_image">',
        f'<meta name="twitter:title" content="{e(name)}">',
        f'<meta name="twitter:description" content="{e(desc)}">',
    ]
    if image:
        head.append(f'<meta name="twitter:image" content="{e(base_url)}/{e(image)}">')

    # depois do charset (precisa vir nos primeiros bytes) e antes das URLs relativas
    anchor = '<meta charset="utf-8">'
    if anchor in template:
        page = template.replace(anchor, anchor + "\n" + "\n".join(head), 1)
    else:
        page = template.replace("<head>", "<head>\n" + "\n".join(head), 1)
    page = re.sub(r"<title>.*?</title>", f"<title>{e(name)} — {e(site_name)}</title>",
                  page, count=1, flags=re.S)
    page = page.replace(
        '<script src="assets/js/gallery.js"></script>',
        f'<script>window.GALLERY_ID = {json.dumps(gallery["id"])};</script>\n'
        '<script src="assets/js/gallery.js"></script>',
        1,
    )
    return page


def main():
    with open(MANIFEST, encoding="utf-8") as fh:
        data = json.load(fh)
    with open(TEMPLATE, encoding="utf-8") as fh:
        template = fh.read()

    site = data.get("site", {})
    if not site.get("url"):
        print("Falta 'url' em site no galleries.json — as tags de preview precisam da URL absoluta.")
        return 1

    keep = set()
    for gallery in data.get("galleries", []):
        folder = os.path.join(PAGES_DIR, gallery["id"])
        os.makedirs(folder, exist_ok=True)
        with open(os.path.join(folder, "index.html"), "w", encoding="utf-8") as fh:
            fh.write(build(template, site, gallery))
        keep.add(gallery["id"])
        print(f"  g/{gallery['id']}/  →  {gallery.get('name') or gallery['id']}")

    # galerias que sumiram do manifesto
    if os.path.isdir(PAGES_DIR):
        for name in os.listdir(PAGES_DIR):
            if name not in keep and os.path.isdir(os.path.join(PAGES_DIR, name)):
                shutil.rmtree(os.path.join(PAGES_DIR, name))
                print(f"  removida: g/{name}/")

    print(f"{len(keep)} página(s) de galeria gerada(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
