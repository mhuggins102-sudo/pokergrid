"""Generate the PokerGrid app icon family from a single 5x5 grid design.

The logo is a Latin-square arrangement of the four suit colors plus a
joker tile rotated through the diagonal so the joker lands at the
center cell — one of each color per row and per column, perfectly
balanced, with the wild card in the middle. Visually it reads as the
game's 5x5 grid lit up in the game's neon suit palette.

Run from the repo root:

    python3 scripts/generate_icons.py

Outputs (overwrites in place):
- assets/icon.png            1024x1024  app icon (iOS) + apple-touch-icon
- assets/favicon.png         192x192    browser tab favicon
- assets/adaptive-icon.png   1024x1024  Android adaptive (content in
                                        center 66% safe zone)
- assets/splash-icon.png     1024x1024  splash screen mark
"""
from __future__ import annotations

import os
from PIL import Image, ImageDraw, ImageFilter

# Repo paths — script lives in scripts/, assets/ is one level up.
HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.normpath(os.path.join(HERE, '..', 'assets'))

# Palette pulled verbatim from src/ui/theme.ts so the logo glows in
# the same colors the in-game cards use.
BG = (6, 7, 13, 255)            # #06070d — app background
SUIT_H = (255, 77, 139, 255)    # #ff4d8b magenta-pink
SUIT_S = (107, 214, 255, 255)   # #6bd6ff cyan
SUIT_D = (255, 210, 74, 255)    # #ffd24a gold-amber
SUIT_C = (92, 255, 154, 255)    # #5cff9a lime-green
JOKER = (209, 139, 255, 255)    # #d18bff violet

# Latin square of (color, glyph-color) tuples. Each suit color appears
# exactly once per row and once per column; the joker rotates through
# the same diagonal so it lands at the center (2, 2). Pattern visually:
#
#   H S D C J
#   S D C J H
#   D C J H S
#   C J H S D
#   J H S D C
LAYOUT = [
    [SUIT_H, SUIT_S, SUIT_D, SUIT_C, JOKER ],
    [SUIT_S, SUIT_D, SUIT_C, JOKER , SUIT_H],
    [SUIT_D, SUIT_C, JOKER , SUIT_H, SUIT_S],
    [SUIT_C, JOKER , SUIT_H, SUIT_S, SUIT_D],
    [JOKER , SUIT_H, SUIT_S, SUIT_D, SUIT_C],
]


def render_grid(canvas_size: int, content_size: int) -> Image.Image:
    """Render the 5x5 logo on a `canvas_size` square with the grid
    occupying `content_size` px in the center. Content < canvas leaves
    a safe-zone padding (used for the Android adaptive icon)."""
    img = Image.new('RGBA', (canvas_size, canvas_size), BG)
    draw = ImageDraw.Draw(img)

    # Grid geometry. Tile gap scales with content size so the grid
    # reads as 25 distinct cells at every output resolution.
    gap = max(1, content_size // 56)
    tile = (content_size - gap * 4) // 5
    radius = max(2, tile // 8)
    origin_x = (canvas_size - (tile * 5 + gap * 4)) // 2
    origin_y = (canvas_size - (tile * 5 + gap * 4)) // 2

    # Faint inner border around the whole grid — gives the logo a
    # contained feel without an explicit frame. Drawn first so tiles
    # paint on top.
    border_pad = max(4, content_size // 40)
    border_box = (
        origin_x - border_pad,
        origin_y - border_pad,
        origin_x + tile * 5 + gap * 4 + border_pad - 1,
        origin_y + tile * 5 + gap * 4 + border_pad - 1,
    )
    border_radius = radius + border_pad
    # Subtle dark panel under the grid so the tiles' glow has something
    # to sit on — like the in-game bgPanel.
    panel = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    pd = ImageDraw.Draw(panel)
    pd.rounded_rectangle(border_box, radius=border_radius, fill=(13, 17, 28, 255))
    img.alpha_composite(panel)
    draw = ImageDraw.Draw(img)

    # Glow layer: draw all tile silhouettes at low alpha onto a
    # separate canvas, blur it, and composite under the sharp tiles.
    # Costs one extra image but gives the neon-bleed look that
    # matches the in-game card glow.
    glow = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)

    for r in range(5):
        for c in range(5):
            color = LAYOUT[r][c]
            x0 = origin_x + c * (tile + gap)
            y0 = origin_y + r * (tile + gap)
            x1 = x0 + tile - 1
            y1 = y0 + tile - 1
            # Glow stamp — slightly enlarged tile silhouette at
            # reduced alpha. The Gaussian blur further down softens
            # it into a halo.
            grow = max(2, tile // 14)
            gdraw.rounded_rectangle(
                (x0 - grow, y0 - grow, x1 + grow, y1 + grow),
                radius=radius + grow,
                fill=(color[0], color[1], color[2], 110),
            )

    blur_r = max(3, content_size // 80)
    glow = glow.filter(ImageFilter.GaussianBlur(blur_r))
    img.alpha_composite(glow)

    # Sharp tiles on top of the glow halo.
    draw = ImageDraw.Draw(img)
    for r in range(5):
        for c in range(5):
            color = LAYOUT[r][c]
            x0 = origin_x + c * (tile + gap)
            y0 = origin_y + r * (tile + gap)
            x1 = x0 + tile - 1
            y1 = y0 + tile - 1
            draw.rounded_rectangle((x0, y0, x1, y1), radius=radius, fill=color)
            # Inner highlight — a slightly lighter rounded rect inset
            # at the top to mimic the chip lighting in the game.
            inset = max(2, tile // 12)
            highlight = (
                min(255, color[0] + 40),
                min(255, color[1] + 40),
                min(255, color[2] + 40),
                90,
            )
            draw.rounded_rectangle(
                (x0 + inset, y0 + inset, x1 - inset, y0 + tile // 2),
                radius=max(1, radius - inset),
                fill=highlight,
            )

    return img


def main() -> None:
    # Master icon: full-bleed grid. iOS rounds the whole 1024px square
    # itself, so the design fills the canvas with a small dark margin
    # for breathing room rather than safe-zoning further.
    master = render_grid(1024, int(1024 * 0.82))
    master.save(os.path.join(ASSETS, 'icon.png'))
    master.save(os.path.join(ASSETS, 'splash-icon.png'))

    # Browser favicon: 192px renders cleanly at 16/32/48 tab sizes and
    # at retina bookmark sizes too. Rendering at 192 directly (not
    # downscaled from 1024) keeps tile edges crisp.
    fav = render_grid(192, int(192 * 0.82))
    fav.save(os.path.join(ASSETS, 'favicon.png'))

    # Android adaptive icon — content must fit the inner 66% so the
    # system mask (circle / squircle / teardrop) never clips a tile.
    adaptive = render_grid(1024, int(1024 * 0.62))
    adaptive.save(os.path.join(ASSETS, 'adaptive-icon.png'))


if __name__ == '__main__':
    main()
