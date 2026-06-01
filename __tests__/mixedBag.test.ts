import { seededRng } from '../src/game/deck';
import { findChallenge } from '../src/game/challenges';
import {
  cardMatchesSlot,
  isPlaceholder,
  SlotKind,
} from '../src/game/bonusCards';
import { GameState, newGame, step } from '../src/game/state';

const SLOT_KINDS: SlotKind[] = ['special', 'in-game', 'end-game'];

// Mixed Bag challenge — newGame seeded with slotCategories. The Hard
// difficulty matches what App.tsx uses for challenges.
const mixedBag = (): GameState =>
  newGame(
    'hard',
    seededRng(42),
    findChallenge('mixed-bag').scoreTarget,
    undefined,
    false,
    false,
    [],
    [],
    [],
    false,
    false,
    [],
    SLOT_KINDS
  );

describe('Mixed Bag challenge', () => {
  it('seeds 3 placeholder slots in category order', () => {
    const s = mixedBag();
    expect(s.bonusCards).toHaveLength(3);
    expect(s.bonusCards.map(c => c.placeholderKind)).toEqual([
      'special',
      'in-game',
      'end-game',
    ]);
    expect(s.bonusCards.every(c => isPlaceholder(c))).toBe(true);
    expect(s.slotCategories).toEqual(SLOT_KINDS);
  });

  it('bonus deck mixes regular + special pools so every slot has cards to draw', () => {
    const s = mixedBag();
    // Every slot kind has at least one drawable card in the deck.
    for (const kind of SLOT_KINDS) {
      expect(s.bonusDeck.some(c => cardMatchesSlot(c, kind))).toBe(true);
    }
  });

  it('♣ goes to awaiting-bonus-slot-choice instead of drawing directly', () => {
    let s = mixedBag();
    // Wait — Hard difficulty starts with no bonus card, and the drawn
    // card is whatever the seeded shuffle produced. To exercise the
    // ♣ path deterministically we drive it via BEGIN_SUIT_ACTION with
    // an explicit suit override.
    s = step(s, { type: 'BEGIN_SUIT_ACTION', forSuit: 'C' });
    expect(s.phase.kind).toBe('awaiting-bonus-slot-choice');
  });

  it('picking a slot draws 2 cards filtered to that slot category', () => {
    let s = mixedBag();
    s = step(s, { type: 'BEGIN_SUIT_ACTION', forSuit: 'C' });
    expect(s.phase.kind).toBe('awaiting-bonus-slot-choice');

    // Pick the green (special) slot.
    s = step(s, { type: 'BONUS_PICK_SLOT', slot: 0 });
    if (s.phase.kind !== 'bonus-card-resolving') {
      throw new Error('Expected to transition to bonus-card-resolving');
    }
    expect(s.phase.targetSlot).toBe(0);
    expect(s.phase.drawn.length).toBeGreaterThan(0);
    expect(s.phase.drawn.length).toBeLessThanOrEqual(2);
    for (const card of s.phase.drawn) {
      expect(cardMatchesSlot(card, 'special')).toBe(true);
    }
  });

  it('BONUS_KEEP replaces the placeholder at targetSlot, not appended', () => {
    let s = mixedBag();
    s = step(s, { type: 'BEGIN_SUIT_ACTION', forSuit: 'C' });
    s = step(s, { type: 'BONUS_PICK_SLOT', slot: 1 }); // yellow slot
    if (s.phase.kind !== 'bonus-card-resolving') {
      throw new Error('Expected to transition to bonus-card-resolving');
    }
    const kept = s.phase.drawn[0];

    s = step(s, { type: 'BONUS_KEEP', idx: 0 });
    // Hand stays length 3, the yellow placeholder is gone, the kept
    // card is in slot 1.
    expect(s.bonusCards).toHaveLength(3);
    expect(s.bonusCards[1]).toBe(kept);
    // The other two slots are still placeholders.
    expect(isPlaceholder(s.bonusCards[0])).toBe(true);
    expect(isPlaceholder(s.bonusCards[2])).toBe(true);
  });

  it('a subsequent draw into the same slot overwrites the real card (forced swap)', () => {
    let s = mixedBag();
    // First ♣ → pick slot 1 → keep a card.
    s = step(s, { type: 'BEGIN_SUIT_ACTION', forSuit: 'C' });
    s = step(s, { type: 'BONUS_PICK_SLOT', slot: 1 });
    if (s.phase.kind !== 'bonus-card-resolving') {
      throw new Error('Expected to transition to bonus-card-resolving');
    }
    const firstKept = s.phase.drawn[0];
    s = step(s, { type: 'BONUS_KEEP', idx: 0 });
    expect(s.bonusCards[1]).toBe(firstKept);

    // Second ♣ → pick slot 1 again → forces overwrite. Need to
    // BEGIN_SUIT_ACTION again, but the reducer requires a drawn card
    // to fire the perk. The default state from newGame already has a
    // drawn card; once we resolve the first ♣ it advances to the
    // next draw. Manually re-enter awaiting-action for the test by
    // dispatching CANCEL... actually finishBonusFlow already calls
    // drawNext which leaves us in awaiting-action with a fresh draw.
    s = step(s, { type: 'BEGIN_SUIT_ACTION', forSuit: 'C' });
    if (s.phase.kind !== 'awaiting-bonus-slot-choice') {
      throw new Error('Expected awaiting-bonus-slot-choice');
    }
    s = step(s, { type: 'BONUS_PICK_SLOT', slot: 1 });
    if (s.phase.kind !== 'bonus-card-resolving') {
      throw new Error('Expected to transition to bonus-card-resolving');
    }
    const secondKept = s.phase.drawn[0];
    s = step(s, { type: 'BONUS_KEEP', idx: 0 });
    // Slot 1 now holds the second-kept card; firstKept is gone.
    expect(s.bonusCards[1]).toBe(secondKept);
    // swappedBonus flagged because we overwrote a real card.
    expect(s.swappedBonus).toBe(true);
  });

  it('CANCEL_ACTION on slot-choice returns to awaiting-action without spending the ♣', () => {
    let s = mixedBag();
    s = step(s, { type: 'BEGIN_SUIT_ACTION', forSuit: 'C' });
    expect(s.phase.kind).toBe('awaiting-bonus-slot-choice');
    const beforePerkSpent = s.perkSpent.length;
    s = step(s, { type: 'CANCEL_ACTION' });
    expect(s.phase.kind).toBe('awaiting-action');
    // Drawn card is still in hand (cancel doesn't spend it).
    expect(s.perkSpent.length).toBe(beforePerkSpent);
  });
});
