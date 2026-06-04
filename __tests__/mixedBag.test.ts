import { seededRng } from '../src/game/deck';
import { findChallenge } from '../src/game/challenges';
import {
  BonusCard,
  BONUS_DECK_POOL,
  cardMatchesSlot,
  DOUBLER_CARD,
  isPlaceholder,
  SlotKind,
  SPOTLIGHT_ID,
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

  describe('Spotlight exclusivity', () => {
    // Helper: surgically pre-place a card at a Mixed Bag slot. Mirrors
    // what handleBonusKeep does for the categorized-slot path.
    const seatCard = (s: GameState, slot: number, card: BonusCard): GameState => {
      const hand = s.bonusCards.slice();
      hand[slot] = card;
      return { ...s, bonusCards: hand };
    };
    const spotlightCard = (): BonusCard => {
      const c = BONUS_DECK_POOL.find(b => b.id === SPOTLIGHT_ID);
      if (!c) throw new Error('Spotlight not in pool');
      return c;
    };
    const aYellow = (): BonusCard => {
      const c = BONUS_DECK_POOL.find(b => b.lineEffect && !b.gridEffect);
      if (!c) throw new Error('No yellow card in pool');
      return c;
    };
    const aPurple = (): BonusCard => {
      // Pick a purple that ISN'T Spotlight so the "another purple
      // arrives" scenario works.
      const c = BONUS_DECK_POOL.find(
        b => b.gridEffect && !b.lineEffect && b.id !== SPOTLIGHT_ID
      );
      if (!c) throw new Error('No non-Spotlight purple card in pool');
      return c;
    };

    it('picking up Spotlight clears unused real cards from the other slots', () => {
      let s = mixedBag();
      // Slot 1 (yellow): a real bonus card. Slot 0 (green): leave the
      // placeholder. Slot 2 (purple): about to receive Spotlight.
      s = seatCard(s, 1, aYellow());
      // Stuff Spotlight directly into the drawn flow at slot 2.
      s = {
        ...s,
        phase: {
          kind: 'bonus-card-resolving',
          drawn: [spotlightCard()],
          targetSlot: 2,
          returnTo: 'awaiting-action',
        },
      };
      s = step(s, { type: 'BONUS_KEEP', idx: 0 });
      // Slot 2 holds Spotlight, slot 1 has been reset to its yellow
      // placeholder, slot 0 was already a green placeholder.
      expect(s.bonusCards[2].id).toBe(SPOTLIGHT_ID);
      expect(isPlaceholder(s.bonusCards[1])).toBe(true);
      expect(s.bonusCards[1].placeholderKind).toBe('in-game');
      expect(isPlaceholder(s.bonusCards[0])).toBe(true);
      expect(s.bonusCards[0].placeholderKind).toBe('special');
    });

    it('used green specials survive a Spotlight pickup', () => {
      let s = mixedBag();
      // Slot 0 (green): a USED special card. Spotlight arrives in slot 2.
      s = seatCard(s, 0, { ...DOUBLER_CARD, used: true });
      s = {
        ...s,
        phase: {
          kind: 'bonus-card-resolving',
          drawn: [spotlightCard()],
          targetSlot: 2,
          returnTo: 'awaiting-action',
        },
      };
      s = step(s, { type: 'BONUS_KEEP', idx: 0 });
      // The used Doubler stays — it was already disabled, not active.
      expect(s.bonusCards[0].id).toBe(DOUBLER_CARD.id);
      expect(s.bonusCards[0].used).toBe(true);
      expect(s.bonusCards[2].id).toBe(SPOTLIGHT_ID);
    });

    it('Spotlight is discarded when another bonus card lands in another slot', () => {
      let s = mixedBag();
      // Slot 2 (purple): Spotlight already held.
      s = seatCard(s, 2, spotlightCard());
      // A new yellow card arrives in slot 1.
      const yellow = aYellow();
      s = {
        ...s,
        phase: {
          kind: 'bonus-card-resolving',
          drawn: [yellow],
          targetSlot: 1,
          returnTo: 'awaiting-action',
        },
      };
      s = step(s, { type: 'BONUS_KEEP', idx: 0 });
      // Slot 1 holds the new yellow; Spotlight's slot is back to its
      // purple placeholder.
      expect(s.bonusCards[1].id).toBe(yellow.id);
      expect(isPlaceholder(s.bonusCards[2])).toBe(true);
      expect(s.bonusCards[2].placeholderKind).toBe('end-game');
    });

    it("Spotlight is also discarded if another purple card lands in Spotlight's own slot", () => {
      let s = mixedBag();
      s = seatCard(s, 2, spotlightCard());
      const purple = aPurple();
      s = {
        ...s,
        phase: {
          kind: 'bonus-card-resolving',
          drawn: [purple],
          targetSlot: 2,
          returnTo: 'awaiting-action',
        },
      };
      s = step(s, { type: 'BONUS_KEEP', idx: 0 });
      // The new purple replaces Spotlight at slot 2 naturally — no
      // surviving Spotlight anywhere.
      expect(s.bonusCards[2].id).toBe(purple.id);
      expect(s.bonusCards.some(c => c.id === SPOTLIGHT_ID)).toBe(false);
    });
  });
});
