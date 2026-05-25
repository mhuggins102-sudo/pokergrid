# Share endpoint (Cloudflare Pages Functions)

These functions render the share-card preview used by the in-game "Share"
button. They run on Cloudflare's edge — Pages auto-discovers them when the
project is deployed.

## Routes

- `GET /share?score=…&mode=…&diff=…&grid=…`
  HTML page with Open Graph + Twitter Card meta tags. iMessage / Slack /
  Discord / Twitter etc. fetch this when the URL is unfurled.

- `GET /share/og.png?score=…&mode=…&diff=…&grid=…`
  The 1200×630 PNG referenced by `og:image`. Generated on demand via
  [workers-og](https://github.com/kvnang/workers-og) (Satori-based JSX → PNG).

## URL parameters

- `score`  – integer, displayed prominently on the card.
- `mode`   – `free` | `targets-up` | `challenge`. Affects the mode chip.
- `diff`   – `easy` | `medium` | `hard`. Replaces the mode label for Free runs.
- `grid`   – 50-char encoding of the 25-cell grid. Two chars per cell:
  - `__` empty
  - `JK` joker
  - `<rank><suit>` standard card, where rank ∈ `A 2 3 4 5 6 7 8 9 T J Q K`
    and suit ∈ `H S D C` (`T` is used for the rank 10 so each cell stays at
    two characters).

## Deployment

Cloudflare Pages auto-installs npm deps and bundles every file under
`functions/` as edge handlers. Push to the connected branch — no extra config
beyond `workers-og` being listed in the root `package.json`.

If you've never connected the repo to Pages:
1. Cloudflare → Pages → Create project → connect your Git provider.
2. Build command: `npm run build:web`
3. Build output: `dist`
4. The first deploy may take a minute longer than later ones while the
   workers-og Satori runtime is cached.
