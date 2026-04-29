#!/usr/bin/env python3
"""Build-time helper: render PWA PNG icons from a programmatic recipe.

This script is NOT part of the deployed app. Run once after editing the icon
to refresh the PNGs in icons/. Requires Pillow.

Usage:
    python3 scripts/make_icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "icons"
OUT.mkdir(exist_ok=True)

GREEN = (7, 94, 84, 255)
WHITE = (255, 255, 255, 255)


def rounded_rect(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def draw_icon(size: int, padding_ratio: float = 0.0) -> Image.Image:
    """Render a square icon at `size`. padding_ratio adds inset for maskable."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    pad = int(size * padding_ratio)
    inner = size - 2 * pad
    # Background tile (rounded for normal icon, full square for maskable since
    # the OS will mask it).
    if padding_ratio == 0:
        rounded_rect(d, (0, 0, size, size), radius=int(size * 0.19), fill=GREEN)
    else:
        d.rectangle((0, 0, size, size), fill=GREEN)

    # Speech bubble — coordinates work in 512x512 reference, scaled.
    s = inner / 512.0

    def sx(x): return pad + int(x * s)
    def sy(y): return pad + int(y * s)

    bubble = (sx(96), sy(160), sx(416), sy(360))
    rounded_rect(d, bubble, radius=int(40 * s), fill=WHITE)

    # Tail (simple triangle below the bubble)
    tail = [(sx(208), sy(360)), (sx(208), sy(416)), (sx(280), sy(360))]
    d.polygon(tail, fill=WHITE)

    # "Delta" triangle (increment) inside the bubble
    delta = [(sx(232), sy(320)), (sx(256), sy(232)), (sx(280), sy(320))]
    d.polygon(delta, fill=GREEN)

    # Two "eye" dots for friendliness
    r = int(10 * s)
    d.ellipse((sx(216) - r, sy(264) - r, sx(216) + r, sy(264) + r), fill=GREEN)
    d.ellipse((sx(296) - r, sy(264) - r, sx(296) + r, sy(264) + r), fill=GREEN)

    return img


def main():
    for size in (192, 512):
        img = draw_icon(size)
        img.save(OUT / f"icon-{size}.png", optimize=True)
        print(f"wrote icons/icon-{size}.png")
    img = draw_icon(512, padding_ratio=0.15)
    img.save(OUT / "icon-maskable-512.png", optimize=True)
    print("wrote icons/icon-maskable-512.png")


if __name__ == "__main__":
    main()
