// GET /share/og.png?score=...&mode=...&diff=...&grid=<50-char encoding>
//
// Generates the 1200×630 share card image that the /share HTML page references
// from its og:image meta tag. iMessage, Slack, Discord, Twitter etc. fetch
// this directly when they unfurl the shared link.
//
// Rendered with workers-og (Satori) which takes HTML-like JSX and produces a
// PNG in the Cloudflare Workers runtime — no headless browser required.

import { ImageResponse } from 'workers-og';
import {
  CellCode,
  ModeLabel,
  parseShare,
  Rank,
  shareTitle,
  Suit,
} from './_shared';

// ---- Theme (matches src/ui/theme.ts) -----------------------------------------

const COLORS = {
  bgBase: '#06070d',
  bgPanel: '#0d111c',
  bgRaised: '#151b2c',
  outline: 'rgba(140, 165, 220, 0.20)',
  textHi: '#e9ecff',
  textMid: '#a8b0d6',
  textLow: '#646b8c',
  accent: '#6bd6ff',
  warn: '#ffb74a',
  joker: '#d18bff',
  suitH: '#ff4d8b',
  suitS: '#6bd6ff',
  suitD: '#ffd24a',
  suitC: '#5cff9a',
};

const SUIT_GLYPH: Record<Suit, string> = { H: '♥', S: '♠', D: '♦', C: '♣' };
const SUIT_COLOR: Record<Suit, string> = {
  H: COLORS.suitH,
  S: COLORS.suitS,
  D: COLORS.suitD,
  C: COLORS.suitC,
};
// Satori renders "10" too wide in a 64px cell; collapse to "T" for display.
const rankDisplay = (r: Rank): string => (r === 'T' ? '10' : r);

// ---- Card cell ---------------------------------------------------------------

const CardCell = ({ cell }: { cell: CellCode | null }) => {
  if (!cell) {
    return (
      <div
        style={{
          display: 'flex',
          width: 80,
          height: 80,
          borderRadius: 6,
          backgroundColor: 'rgba(20, 26, 44, 0.5)',
          border: `1px dashed ${COLORS.outline}`,
        }}
      />
    );
  }
  if (cell.kind === 'joker') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: 80,
          height: 80,
          borderRadius: 6,
          backgroundColor: COLORS.bgRaised,
          border: `2px solid ${COLORS.joker}`,
          boxShadow: `0 0 14px ${COLORS.joker}`,
          color: COLORS.joker,
          fontFamily: 'monospace',
          fontSize: 28,
          fontWeight: 800,
        }}
      >
        ★
      </div>
    );
  }
  const suitColor = SUIT_COLOR[cell.suit];
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: 80,
        height: 80,
        borderRadius: 6,
        backgroundColor: COLORS.bgRaised,
        border: `1px solid ${suitColor}`,
        boxShadow: `0 0 8px ${suitColor}66`,
        color: suitColor,
        fontFamily: 'monospace',
        fontWeight: 800,
        gap: 2,
      }}
    >
      <div style={{ fontSize: 28, lineHeight: 1 }}>{rankDisplay(cell.rank)}</div>
      <div style={{ fontSize: 20, lineHeight: 1 }}>{SUIT_GLYPH[cell.suit]}</div>
    </div>
  );
};

// ---- Card layout -------------------------------------------------------------

const ShareCard = ({
  score,
  mode,
  difficulty,
  grid,
}: {
  score: number;
  mode: ModeLabel;
  difficulty: string | null;
  grid: (CellCode | null)[];
}) => {
  const modeChip = mode === 'Free' && difficulty
    ? difficulty.toUpperCase()
    : mode.toUpperCase();

  // Build 5 rows of 5 cells.
  const rows: (CellCode | null)[][] = [];
  for (let r = 0; r < 5; r++) rows.push(grid.slice(r * 5, r * 5 + 5));

  return (
    <div
      style={{
        display: 'flex',
        width: 1200,
        height: 630,
        backgroundColor: COLORS.bgBase,
        // Subtle radial wash to break up the flat black.
        backgroundImage:
          `radial-gradient(circle at 30% 20%, rgba(107, 214, 255, 0.10), transparent 40%),` +
          ` radial-gradient(circle at 80% 80%, rgba(209, 139, 255, 0.08), transparent 50%)`,
        padding: 40,
        alignItems: 'center',
        gap: 56,
      }}
    >
      {/* Left: 5×5 grid */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          padding: 18,
          backgroundColor: COLORS.bgPanel,
          borderRadius: 12,
          border: `1px solid ${COLORS.outline}`,
          boxShadow: `0 0 30px ${COLORS.accent}33`,
        }}
      >
        {rows.map((row, r) => (
          <div key={r} style={{ display: 'flex', gap: 6 }}>
            {row.map((cell, c) => (
              <CardCell key={c} cell={cell} />
            ))}
          </div>
        ))}
      </div>

      {/* Right: score + mode + branding */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          alignItems: 'flex-start',
          justifyContent: 'center',
          gap: 20,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontFamily: 'monospace',
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: 6,
            color: COLORS.textMid,
            textTransform: 'uppercase',
          }}
        >
          PokerGrid
        </div>

        <div
          style={{
            display: 'flex',
            padding: '6px 16px',
            backgroundColor: 'rgba(107, 214, 255, 0.15)',
            border: `1px solid ${COLORS.accent}`,
            borderRadius: 999,
            color: COLORS.accent,
            fontFamily: 'monospace',
            fontSize: 18,
            fontWeight: 800,
            letterSpacing: 3,
          }}
        >
          {modeChip}
        </div>

        <div
          style={{
            display: 'flex',
            fontFamily: 'monospace',
            fontSize: 36,
            fontWeight: 700,
            color: COLORS.textHi,
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}
        >
          Final Score
        </div>

        <div
          style={{
            display: 'flex',
            fontFamily: 'monospace',
            fontSize: 180,
            fontWeight: 900,
            color: COLORS.accent,
            lineHeight: 1,
            letterSpacing: 4,
            textShadow: `0 0 30px ${COLORS.accent}`,
          }}
        >
          {score}
        </div>

        <div
          style={{
            display: 'flex',
            fontFamily: 'monospace',
            fontSize: 16,
            color: COLORS.textLow,
            letterSpacing: 2,
            marginTop: 12,
          }}
        >
          5×5 poker solitaire · pokergrid
        </div>
      </div>
    </div>
  );
};

// ---- Handler -----------------------------------------------------------------

export const onRequest: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);
  const { score, mode, difficulty, grid } = parseShare(url);

  return new ImageResponse(
    <ShareCard score={score} mode={mode} difficulty={difficulty} grid={grid} />,
    {
      width: 1200,
      height: 630,
      headers: {
        'cache-control': 'public, max-age=600, s-maxage=600',
      },
    }
  );
};
