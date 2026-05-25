// GET /share/og.png?score=...&mode=...&diff=...&grid=<50-char encoding>
//
// Generates the 1200×630 share card image referenced by the /share page's
// og:image meta tag. Link-preview clients (iMessage, Slack, Discord, Twitter)
// fetch this directly when they unfurl a shared PokerGrid URL.
//
// Rendered with workers-og — Satori under the hood, no headless browser. The
// engine accepts an HTML string (not JSX), so we build the markup as a
// template literal with inline styles. Layout must obey Satori's flex-only
// constraint: every element that contains more than one child needs an
// explicit `display: flex` (and almost everything does, even leaf <div>s
// containing text, to satisfy the renderer).

import { ImageResponse } from 'workers-og';
import {
  CellCode,
  ModeLabel,
  parseShare,
  Rank,
  Suit,
} from './_shared';

// ---- Theme (mirrors src/ui/theme.ts) -----------------------------------------

const COLOR = {
  bgBase: '#06070d',
  bgPanel: '#0d111c',
  bgRaised: '#151b2c',
  outline: 'rgba(140, 165, 220, 0.20)',
  textHi: '#e9ecff',
  textMid: '#a8b0d6',
  textLow: '#646b8c',
  accent: '#6bd6ff',
  joker: '#d18bff',
  suitH: '#ff4d8b',
  suitS: '#6bd6ff',
  suitD: '#ffd24a',
  suitC: '#5cff9a',
};

const SUIT_COLOR: Record<Suit, string> = {
  H: COLOR.suitH,
  S: COLOR.suitS,
  D: COLOR.suitD,
  C: COLOR.suitC,
};
const rankDisplay = (r: Rank): string => (r === 'T' ? '10' : r);

// ---- HTML builders -----------------------------------------------------------

const cellHtml = (cell: CellCode | null): string => {
  // Empty
  if (!cell) {
    return `<div style="display:flex;width:80px;height:80px;border-radius:6px;background:rgba(20,26,44,0.5);border:1px dashed ${COLOR.outline}"></div>`;
  }
  // Joker — Satori's default font doesn't ship the suit glyphs ♥♠♦♣ so we'd
  // get tofu rectangles if we used them. The 4-color suit border + a single
  // big rank reads cleaner anyway; the joker gets a star which IS in the font.
  if (cell.kind === 'joker') {
    return `<div style="display:flex;align-items:center;justify-content:center;width:80px;height:80px;border-radius:6px;background:${COLOR.bgRaised};border:2px solid ${COLOR.joker};box-shadow:0 0 14px ${COLOR.joker};color:${COLOR.joker};font-family:monospace;font-size:44px;font-weight:800">★</div>`;
  }
  // Standard card: rank only, vertically + horizontally centered, in the
  // suit's color. The border color also encodes the suit.
  const sc = SUIT_COLOR[cell.suit];
  const rd = rankDisplay(cell.rank);
  // Single-character ranks get a slightly bigger glyph than '10' so the
  // optical sizing reads consistent across the grid.
  const fontSize = rd.length === 1 ? 44 : 36;
  return `<div style="display:flex;align-items:center;justify-content:center;width:80px;height:80px;border-radius:6px;background:${COLOR.bgRaised};border:1px solid ${sc};box-shadow:0 0 8px ${sc}66;color:${sc};font-family:monospace;font-weight:800;font-size:${fontSize}px;line-height:1">${rd}</div>`;
};

const gridHtml = (grid: (CellCode | null)[]): string => {
  const rows: string[] = [];
  for (let r = 0; r < 5; r++) {
    const cells = grid
      .slice(r * 5, r * 5 + 5)
      .map(cellHtml)
      .join('');
    rows.push(`<div style="display:flex;gap:6px">${cells}</div>`);
  }
  return `
    <div style="display:flex;flex-direction:column;gap:6px;padding:18px;background:${COLOR.bgPanel};border-radius:12px;border:1px solid ${COLOR.outline};box-shadow:0 0 30px ${COLOR.accent}33">
      ${rows.join('')}
    </div>
  `;
};

const buildShareHtml = (
  score: number,
  mode: ModeLabel,
  difficulty: string | null,
  grid: (CellCode | null)[]
): string => {
  const modeChip =
    mode === 'Free' && difficulty
      ? difficulty.toUpperCase()
      : mode.toUpperCase();

  return `
    <div style="display:flex;width:1200px;height:630px;background:${COLOR.bgBase};background-image:radial-gradient(circle at 30% 20%, rgba(107,214,255,0.10), transparent 40%),radial-gradient(circle at 80% 80%, rgba(209,139,255,0.08), transparent 50%);padding:40px;align-items:center;gap:56px">
      ${gridHtml(grid)}
      <div style="display:flex;flex-direction:column;flex:1;align-items:flex-start;justify-content:center;gap:20px">
        <div style="display:flex;font-family:monospace;font-size:22px;font-weight:800;letter-spacing:6px;color:${COLOR.textMid};text-transform:uppercase">PokerGrid</div>
        <div style="display:flex;padding:6px 16px;background:rgba(107,214,255,0.15);border:1px solid ${COLOR.accent};border-radius:999px;color:${COLOR.accent};font-family:monospace;font-size:18px;font-weight:800;letter-spacing:3px">${modeChip}</div>
        <div style="display:flex;font-family:monospace;font-size:36px;font-weight:700;color:${COLOR.textHi};letter-spacing:2px;text-transform:uppercase">Final Score</div>
        <div style="display:flex;font-family:monospace;font-size:180px;font-weight:900;color:${COLOR.accent};line-height:1;letter-spacing:4px;text-shadow:0 0 30px ${COLOR.accent}">${score}</div>
        <div style="display:flex;font-family:monospace;font-size:16px;color:${COLOR.textLow};letter-spacing:2px;margin-top:12px">5×5 poker solitaire · pokergrid</div>
      </div>
    </div>
  `;
};

// ---- Handler -----------------------------------------------------------------

export const onRequest: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);
  const { score, mode, difficulty, grid } = parseShare(url);

  const html = buildShareHtml(score, mode, difficulty, grid);

  return new ImageResponse(html, {
    width: 1200,
    height: 630,
    // workers-og defaults the content-type to image/png. We add cache headers
    // so link-preview unfurl bursts don't re-render the same card.
    headers: {
      'cache-control': 'public, max-age=600, s-maxage=600',
    },
  });
};
