// Shared parsing + formatting used by /share and /share/og.png.

export type ParsedShare = {
  score: number;
  mode: ModeLabel;
  difficulty: string | null;
  // 25-cell grid. Each cell: null (empty), 'JK' (joker), or a 2-char rank+suit.
  grid: (CellCode | null)[];
};

export type CellCode =
  | { kind: 'joker' }
  | { kind: 'card'; rank: Rank; suit: Suit };

export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K';
export type Suit = 'H' | 'S' | 'D' | 'C';
export type ModeLabel = 'Free' | 'Targets Up' | 'Challenge' | 'Daily';

const RANKS: Set<string> = new Set(['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K']);
const SUITS: Set<string> = new Set(['H', 'S', 'D', 'C']);

// 50-char fixed encoding: 25 cells × 2 chars.
//  '__' = empty
//  'JK' = joker
//  <rank><suit> = standard card (rank uses 'T' for 10)
export const decodeGrid = (s: string | null): (CellCode | null)[] => {
  const out: (CellCode | null)[] = Array.from({ length: 25 }, () => null);
  if (!s || s.length < 50) return out;
  for (let i = 0; i < 25; i++) {
    const pair = s.slice(i * 2, i * 2 + 2);
    if (pair === '__') {
      out[i] = null;
    } else if (pair === 'JK') {
      out[i] = { kind: 'joker' };
    } else if (RANKS.has(pair[0]) && SUITS.has(pair[1])) {
      out[i] = { kind: 'card', rank: pair[0] as Rank, suit: pair[1] as Suit };
    }
  }
  return out;
};

const MODE_LABELS: Record<string, ModeLabel> = {
  free: 'Free',
  'targets-up': 'Targets Up',
  challenge: 'Challenge',
  daily: 'Daily',
};

export const parseShare = (url: URL): ParsedShare => {
  const score = Math.max(0, parseInt(url.searchParams.get('score') ?? '0', 10) || 0);
  const modeRaw = (url.searchParams.get('mode') ?? 'free').toLowerCase();
  const mode = MODE_LABELS[modeRaw] ?? 'Free';
  const difficulty = url.searchParams.get('diff'); // 'easy' | 'medium' | 'hard' | null
  const grid = decodeGrid(url.searchParams.get('grid'));
  return { score, mode, difficulty, grid };
};

export const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, c => (
    c === '&' ? '&amp;' :
    c === '<' ? '&lt;' :
    c === '>' ? '&gt;' :
    c === '"' ? '&quot;' : '&#39;'
  ));

export const shareTitle = (score: number, mode: ModeLabel, difficulty: string | null): string => {
  const label = mode === 'Free' && difficulty
    ? difficulty.charAt(0).toUpperCase() + difficulty.slice(1)
    : mode;
  return `I scored ${score} on PokerGrid (${label}). Can you beat me?`;
};
