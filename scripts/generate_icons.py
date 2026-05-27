"""Generate the PokerGrid app icon family from a single 5x5 grid design.

The logo is a 5x5 grid where two cells are the joker (violet, matching
the game's two-joker cap on Easy difficulty) and the other 23 are
filled with the four suit colors. Suit placement is randomized — with
a fixed seed for reproducibility — so the icon reads as a real
"deal" of the deck rather than a rigid pattern.

Run from the repo root:

    python3 scripts/generate_icons.py

Outputs (overwrites in place):

    Native builds (Expo bundles these into the iOS / Android app):
    - assets/icon.png            1024x1024  app icon
    - assets/favicon.png         192x192    Expo web fallback
    - assets/adaptive-icon.png   1024x1024  Android adaptive (safe-zoned)
    - assets/splash-icon.png     1024x1024  splash screen mark

    Web build (Expo copies public/ verbatim to the served root, so
    these are what /favicon.png, /icon.png, /apple-touch-icon.png and
    the manifest resolve to in a deployed web build):
    - public/favicon.png         192x192
    - public/favicon-32.png      32x32
    - public/icon.png            1024x1024
    - public/apple-touch-icon.png 180x180
"""
from __future__ import annotations

import os
import random
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
ASSETS = os.path.join(ROOT, 'assets')
PUBLIC = os.path.join(ROOT, 'public')

# Palette pulled verbatim from src/ui/theme.ts so the logo glows in
# the same colors the in-game cards use.
BG = (6, 7, 13, 255)            # #06070d — app background
SUIT_H = (255, 77, 139, 255)    # #ff4d8b magenta-pink
SUIT_S = (107, 214, 255, 255)   # #6bd6ff cyan
SUIT_D = (255, 210, 74, 255)    # #ffd24a gold-amber
SUIT_C = (92, 255, 154, 255)    # #5cff9a lime-green
JOKER = (209, 139, 255, 255)    # #d18bff violet

# Joker cells. Easy ships at most two jokers in the deck, so the logo
# has exactly two violet squares — placed on an anti-diagonal so they
# read as a balanced accent rather than a mirror pair on a symmetry
# axis.
JOKER_CELLS = {(1, 3), (3, 1)}

# Random fill seed. The layout is constraint-satisfied (no two
# orthogonally-adjacent cells share a suit color) and tries to keep
# the four suits roughly balanced; re-roll by changing this number.
SUIT_SEED = 4

SUITS = (SUIT_H, SUIT_S, SUIT_D, SUIT_C)


def _ortho_neighbors(r: int, c: int):
    for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        nr, nc = r + dr, c + dc
        if 0 <= nr < 5 and 0 <= nc < 5:
            yield nr, nc


def build_layout() -> list[list[tuple[int, int, int, int]]]:
    """Fill the 5x5 grid so no two orthogonally-adjacent cells share
    a suit color, biased toward an even count of each suit. Jokers
    sit at JOKER_CELLS and don't constrain neighbors (violet isn't
    one of the four suit choices). The output still looks random —
    the constraint just prevents the eye from latching onto
    same-color blobs that the previous unconstrained shuffle would
    occasionally produce."""
    rng = random.Random(SUIT_SEED)
    grid: list[list[tuple[int, int, int, int] | None]] = [[None] * 5 for _ in range(5)]
    for (r, c) in JOKER_CELLS:
        grid[r][c] = JOKER

    # Counts of each suit used so far. We prefer the least-used valid
    # suit at each step so the four suits stay near balanced (5–6 each
    # of 23 cells); ties broken by RNG so the layout doesn't repeat.
    counts: dict[tuple[int, int, int, int], int] = {s: 0 for s in SUITS}
    cells = [(r, c) for r in range(5) for c in range(5) if grid[r][c] is None]
    rng.shuffle(cells)

    def fill(idx: int) -> bool:
        if idx == len(cells):
            return True
        r, c = cells[idx]
        used = {
            grid[nr][nc]
            for nr, nc in _ortho_neighbors(r, c)
            if grid[nr][nc] is not None
        }
        candidates = [s for s in SUITS if s not in used]
        # Prefer lower-count suits first, with RNG-broken ties.
        rng.shuffle(candidates)
        candidates.sort(key=lambda s: counts[s])
        for color in candidates:
            grid[r][c] = color
            counts[color] += 1
            if fill(idx + 1):
                return True
            grid[r][c] = None
            counts[color] -= 1
        return False

    if not fill(0):
        raise RuntimeError(f'no valid coloring for seed={SUIT_SEED}')

    return [[cast_color(grid[r][c]) for c in range(5)] for r in range(5)]


def cast_color(v):
    assert v is not None
    return v


LAYOUT = build_layout()


def render_grid(canvas_size: int, content_size: int) -> Image.Image:
    """Render the 5x5 logo on a `canvas_size` square with the grid
    occupying `content_size` px in the center. Content < canvas leaves
    a safe-zone padding (used for the Android adaptive icon)."""
    img = Image.new('RGBA', (canvas_size, canvas_size), BG)

    # Grid geometry. Tile gap scales with content size so the grid
    # reads as 25 distinct cells at every output resolution.
    gap = max(1, content_size // 56)
    tile = (content_size - gap * 4) // 5
    radius = max(2, tile // 8)
    origin_x = (canvas_size - (tile * 5 + gap * 4)) // 2
    origin_y = (canvas_size - (tile * 5 + gap * 4)) // 2

    # Faint dark panel under the grid so the tiles' glow has something
    # to sit on — like the in-game bgPanel.
    border_pad = max(4, content_size // 40)
    border_box = (
        origin_x - border_pad,
        origin_y - border_pad,
        origin_x + tile * 5 + gap * 4 + border_pad - 1,
        origin_y + tile * 5 + gap * 4 + border_pad - 1,
    )
    border_radius = radius + border_pad
    panel = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    pd = ImageDraw.Draw(panel)
    pd.rounded_rectangle(border_box, radius=border_radius, fill=(13, 17, 28, 255))
    img.alpha_composite(panel)

    # Glow layer: draw all tile silhouettes at low alpha onto a
    # separate canvas, blur it, and composite under the sharp tiles.
    glow = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    for r in range(5):
        for c in range(5):
            color = LAYOUT[r][c]
            x0 = origin_x + c * (tile + gap)
            y0 = origin_y + r * (tile + gap)
            x1 = x0 + tile - 1
            y1 = y0 + tile - 1
            grow = max(2, tile // 14)
            gdraw.rounded_rectangle(
                (x0 - grow, y0 - grow, x1 + grow, y1 + grow),
                radius=radius + grow,
                fill=(color[0], color[1], color[2], 110),
            )
    blur_r = max(3, content_size // 80)
    glow = glow.filter(ImageFilter.GaussianBlur(blur_r))
    img.alpha_composite(glow)

    # Sharp tiles on top of the glow halo. We render tiles flat (no
    # inner highlight) — the inset rectangle the earlier version drew
    # was readable at 1024px but at 32-180px it didn't blend with the
    # base color and showed up as a visible "gray rectangle inside
    # each cell" in some browser favicon renderings.
    draw = ImageDraw.Draw(img)
    for r in range(5):
        for c in range(5):
            color = LAYOUT[r][c]
            x0 = origin_x + c * (tile + gap)
            y0 = origin_y + r * (tile + gap)
            x1 = x0 + tile - 1
            y1 = y0 + tile - 1
            draw.rounded_rectangle((x0, y0, x1, y1), radius=radius, fill=color)

    return img


def write_native_icons() -> None:
    # Master icon: full-bleed grid. iOS rounds the whole 1024px square
    # itself, so the design fills the canvas with a small dark margin
    # for breathing room rather than safe-zoning further.
    master = render_grid(1024, int(1024 * 0.82))
    master.save(os.path.join(ASSETS, 'icon.png'))
    master.save(os.path.join(ASSETS, 'splash-icon.png'))

    fav = render_grid(192, int(192 * 0.82))
    fav.save(os.path.join(ASSETS, 'favicon.png'))

    # Android adaptive icon — content must fit the inner ~62% so the
    # system mask (circle / squircle / teardrop) never clips a tile.
    adaptive = render_grid(1024, int(1024 * 0.62))
    adaptive.save(os.path.join(ASSETS, 'adaptive-icon.png'))


def write_web_icons() -> None:
    # Files served from /public — these are what the deployed site
    # actually loads when index.html links /favicon.png etc.
    os.makedirs(PUBLIC, exist_ok=True)

    # Browser tab favicon. 192px renders cleanly at 16/32/48 tab sizes
    # and at retina bookmark sizes too.
    render_grid(192, int(192 * 0.82)).save(os.path.join(PUBLIC, 'favicon.png'))
    # 32px is what most desktop browsers actually rasterize the tab
    # to; rendering at 32 directly (instead of downscaling from 192)
    # keeps the tile edges crisp at the size users actually see.
    render_grid(32, int(32 * 0.94)).save(os.path.join(PUBLIC, 'favicon-32.png'))

    # apple-touch-icon — iOS uses this for Home Screen tiles. 180 is
    # the canonical size; iOS will downscale for other targets.
    render_grid(180, int(180 * 0.92)).save(os.path.join(PUBLIC, 'apple-touch-icon.png'))

    # Large icon (manifest + apple-touch fallback). Same artwork as
    # the iOS app icon so the PWA Home Screen tile matches the native
    # build's tile if the user has both installed.
    render_grid(1024, int(1024 * 0.82)).save(os.path.join(PUBLIC, 'icon.png'))


def main() -> None:
    write_native_icons()
    write_web_icons()


if __name__ == '__main__':
    main()

