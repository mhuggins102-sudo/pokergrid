import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  BonusCard,
  SlotKind,
  SPECIAL_DECK_POOL,
} from './src/game/bonusCards';
import { shuffle } from './src/game/deck';
import { Card } from './src/game/cards';
import {
  ChallengeId,
  difficultyForLevel,
  findChallenge,
  targetForLevel,
} from './src/game/challenges';
import { Difficulty, UNDOS_BY_DIFFICULTY } from './src/game/rules';
import { useGame } from './src/ui/hooks/useGame';
import { BonusCardsScreen } from './src/ui/screens/BonusCardsScreen';
import { ChallengesScreen } from './src/ui/screens/ChallengesScreen';
import { GameScreen } from './src/ui/screens/GameScreen';
import { HomeScreen } from './src/ui/screens/HomeScreen';
import { ResultScreen } from './src/ui/screens/ResultScreen';
import { RulesScreen } from './src/ui/screens/RulesScreen';
import { SettingsScreen } from './src/ui/screens/SettingsScreen';
import { AchievementsScreen } from './src/ui/screens/AchievementsScreen';
import { StatsScreen } from './src/ui/screens/StatsScreen';
import { markTutorialSeen, TutorialScreen, tutorialSeen } from './src/ui/screens/TutorialScreen';
import { SettingsProvider } from './src/ui/settings';
import { StatsProvider } from './src/ui/stats';
import { hydrateSavedCards, TUSaveProvider, useTUSave } from './src/ui/targetsUpSave';
import { colors } from './src/ui/theme';

// Play contexts — the "mode" the current run is in. The Game loop itself is
// identical across modes; only the target and the post-game flow differ.
export type PlayContext =
  | { mode: 'free'; difficulty: Difficulty }
  | {
      mode: 'targets-up';
      level: number;
      wins: number;
      // Powered bonus cards carried over from past S/SS-tier wins.
      // They shuffle into the bonus deck of every subsequent level so
      // future ♣ draws can produce them at their boosted multiplier.
      deckExtras?: BonusCard[];
      // S/SS-tier reward carry-over: standard cards the player has
      // chosen to supercharge on past grids. newGame swaps these in
      // for the matching rank+suit in the shuffled deck.
      superchargedDeckCards?: Card[];
      // Base id of the bonus card the player supercharged LAST round
      // (or null if none). The next round's bonus-supercharge picker
      // disables any chip whose base id matches — so the player can't
      // supercharge the same bonus card type on consecutive rounds.
      lastKeptBaseId?: string | null;
    }
  | { mode: 'challenge'; id: ChallengeId };

type Screen =
  | 'home'
  | 'game'
  | 'settings'
  | 'stats'
  | 'achievements'
  | 'rules'
  | 'tutorial'
  | 'bonusCards'
  | 'challenges';

const AppShell = () => {
  const [screen, setScreen] = useState<Screen>('home');
  const [playContext, setPlayContext] = useState<PlayContext | null>(null);
  const [nonce, setNonce] = useState(0);
  // Where the tutorial should return to when finished. First-run / Rules flow
  // returns to 'rules'; launching it from Settings → "Replay tutorial" returns
  // to 'settings'.
  const [tutorialReturn, setTutorialReturn] = useState<Screen>('rules');
  const { save: tuSave } = useTUSave();

  // First-run: pop up the single-page Rules. Mark seen on dismiss so we
  // don't show it again. The user can re-open from Home → How to Play.
  useEffect(() => {
    tutorialSeen().then(seen => {
      if (!seen) setScreen('rules');
    });
  }, []);

  const dismissRules = () => {
    markTutorialSeen();
    setScreen('home');
  };

  const startFreePlay = (d: Difficulty) => {
    setPlayContext({ mode: 'free', difficulty: d });
    setNonce(n => n + 1);
    setScreen('game');
  };
  const startTargetsUp = () => {
    setPlayContext({ mode: 'targets-up', level: 1, wins: 0 });
    setNonce(n => n + 1);
    setScreen('game');
  };
  const continueTargetsUp = () => {
    if (!tuSave) return;
    const { deckExtras, superchargedDeckCards } = hydrateSavedCards(tuSave);
    setPlayContext({
      mode: 'targets-up',
      level: tuSave.level,
      wins: tuSave.wins,
      deckExtras,
      superchargedDeckCards,
      lastKeptBaseId: tuSave.lastKeptBaseId ?? null,
    });
    setNonce(n => n + 1);
    setScreen('game');
  };
  const startChallenge = (id: ChallengeId) => {
    setPlayContext({ mode: 'challenge', id });
    setNonce(n => n + 1);
    setScreen('game');
  };
  const advanceTargetsUp = (
    deckExtras?: BonusCard[],
    superchargedDeckCards?: Card[],
    // null = picker resolved with no bonus supercharge (player chose
    // grid, all chips matched last round's pick, or no held cards);
    // undefined = caller didn't touch this field, preserve previous.
    lastKeptBaseId?: string | null
  ) => {
    if (playContext?.mode !== 'targets-up') return;
    setPlayContext({
      mode: 'targets-up',
      level: playContext.level + 1,
      wins: playContext.wins + 1,
      deckExtras: deckExtras ?? playContext.deckExtras,
      superchargedDeckCards:
        superchargedDeckCards ?? playContext.superchargedDeckCards,
      lastKeptBaseId:
        lastKeptBaseId !== undefined ? lastKeptBaseId : playContext.lastKeptBaseId,
    });
    setNonce(n => n + 1);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      {screen === 'home' && (
        <HomeScreen
          onStartFree={startFreePlay}
          onStartTargetsUp={startTargetsUp}
          onContinueTargetsUp={continueTargetsUp}
          onOpenChallenges={() => setScreen('challenges')}
          onOpenStats={() => setScreen('stats')}
          onOpenAchievements={() => setScreen('achievements')}
          onOpenSettings={() => setScreen('settings')}
          onOpenRules={() => setScreen('rules')}
        />
      )}
      {screen === 'game' && playContext && (
        <GameContainer
          key={`${nonce}`}
          context={playContext}
          onHome={() => setScreen('home')}
          onReplay={() => setNonce(n => n + 1)}
          onAdvance={advanceTargetsUp}
        />
      )}
      {screen === 'stats' && <StatsScreen onBack={() => setScreen('home')} />}
      {screen === 'achievements' && (
        <AchievementsScreen onBack={() => setScreen('home')} />
      )}
      {screen === 'settings' && (
        <SettingsScreen
          onBack={() => setScreen('home')}
          onReplayTutorial={() => {
            setTutorialReturn('settings');
            setScreen('tutorial');
          }}
        />
      )}
      {screen === 'rules' && (
        <RulesScreen
          onBack={dismissRules}
          onOpenTutorial={() => {
            setTutorialReturn('rules');
            setScreen('tutorial');
          }}
          onOpenBonusCards={() => setScreen('bonusCards')}
        />
      )}
      {screen === 'tutorial' && (
        <TutorialScreen onDone={() => setScreen(tutorialReturn)} />
      )}
      {screen === 'bonusCards' && (
        <BonusCardsScreen onBack={() => setScreen('rules')} />
      )}
      {screen === 'challenges' && (
        <ChallengesScreen
          onBack={() => setScreen('home')}
          onStart={startChallenge}
        />
      )}
    </SafeAreaView>
  );
};

// Natural "phone frame" dimensions used by WebScaler when the app runs on
// a browser. The app is designed mobile-first around a ~390pt-wide
// portrait device. The frame height normally matches the actual viewport
// (in unscaled coordinates) so flex: 1 layouts fill the visible area
// exactly — but it's floored at WEB_MIN_HEIGHT so the GameScreen (whose
// natural minimum is ~674px: ScoreBar 76 + BonusCardStrip 72 + GridView
// 368 + Bottom 158) always has room. On iPhone Safari with the URL bar
// showing (~660px viewport) that triggers a small additional shrink so
// nothing gets clipped; on PWA / taller browsers it's a no-op.
const WEB_NATURAL_WIDTH = 390;
const WEB_MIN_HEIGHT = 700;

const WebScaler = ({ children }: { children: React.ReactNode }) => {
  const [dims, setDims] = useState({ scale: 1, frameHeight: WEB_MIN_HEIGHT });

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const fit = () => {
      const w = window.innerWidth;
      // visualViewport.height is the truly visible vertical area after
      // browser chrome (iOS Safari URL bar + bottom tab bar). Plain
      // window.innerHeight on iOS often reports the URL-bar-collapsed
      // viewport even when the URL bar is showing, which is why the
      // GameScreen used to slide under the bar in Mobile Safari. We
      // fall back to innerHeight on the rare browser without
      // VisualViewport support.
      const h = window.visualViewport?.height ?? window.innerHeight;
      // Shrink only when the viewport is narrower than our design width;
      // never upscale past 1.0 on wide / desktop browsers.
      const widthScale = Math.min(1, w / WEB_NATURAL_WIDTH);
      // Default: match viewport at the width-derived scale.
      let scale = widthScale;
      let frameHeight = h / widthScale;
      // If that leaves the unscaled frame shorter than the tallest screen
      // needs, shrink the whole thing further so the GameScreen never gets
      // clipped at the bottom.
      if (frameHeight < WEB_MIN_HEIGHT) {
        scale = h / WEB_MIN_HEIGHT;
        frameHeight = WEB_MIN_HEIGHT;
      }
      setDims({ scale, frameHeight });
    };
    fit();
    window.addEventListener('resize', fit);
    // visualViewport.resize fires when iOS Safari's URL bar shows or
    // hides — innerHeight doesn't always update for that, so this is
    // the authoritative event on mobile.
    window.visualViewport?.addEventListener('resize', fit);
    return () => {
      window.removeEventListener('resize', fit);
      window.visualViewport?.removeEventListener('resize', fit);
    };
  }, []);

  if (Platform.OS !== 'web') return <>{children}</>;

  // transformOrigin is a react-native-web extension and isn't in the RN
  // ViewStyle types — cast on the inline style to avoid noise.
  const innerStyle = {
    width: WEB_NATURAL_WIDTH,
    height: dims.frameHeight,
    transform: [{ scale: dims.scale }],
    transformOrigin: 'top center',
  } as unknown as object;

  return (
    <View style={styles.webScalerOuter}>
      <View style={innerStyle}>{children}</View>
    </View>
  );
};

export default function App() {
  return (
    <GestureHandlerRootView style={styles.app}>
      <SafeAreaProvider>
        <SettingsProvider>
          <StatsProvider>
            <TUSaveProvider>
              <WebScaler>
                <View style={styles.app}>
                  <StatusBar style="light" />
                  <AppShell />
                </View>
              </WebScaler>
            </TUSaveProvider>
          </StatsProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

interface GameContainerProps {
  context: PlayContext;
  onHome: () => void;
  onReplay: () => void;
  onAdvance: (
    deckExtras?: BonusCard[],
    superchargedDeckCards?: Card[],
    lastKeptBaseId?: string | null
  ) => void;
}

const contextTarget = (ctx: PlayContext): number => {
  switch (ctx.mode) {
    case 'free': return 0; // useGame defaults via difficulty
    case 'targets-up': return targetForLevel(ctx.level);
    case 'challenge': return findChallenge(ctx.id).scoreTarget;
  }
};

const contextDifficulty = (ctx: PlayContext): Difficulty => {
  switch (ctx.mode) {
    case 'free': return ctx.difficulty;
    case 'targets-up': return difficultyForLevel(ctx.level);
    case 'challenge': return 'hard';
  }
};

const contextKicker = (ctx: PlayContext): string | undefined => {
  switch (ctx.mode) {
    case 'free': return ctx.difficulty.toUpperCase();
    case 'targets-up': return `LEVEL ${ctx.level} · TARGETS UP`;
    case 'challenge': {
      const c = findChallenge(ctx.id);
      return `CHALLENGE · ${c.name.toUpperCase()}`;
    }
  }
};

// Per-mode undo cap. Challenge runs are honor-only: no undo. Targets Up
// inherits the cap from the Free Play difficulty its current level
// maps to via difficultyForLevel — so L1–6 (Easy / Medium bands) get
// the 1-undo cap, and L7+ (Hard band) match Free Play Hard's no-undo
// rule. Free Play itself reads straight from UNDOS_BY_DIFFICULTY.
const contextMaxUndos = (ctx: PlayContext): number => {
  switch (ctx.mode) {
    case 'free': return UNDOS_BY_DIFFICULTY[ctx.difficulty];
    case 'targets-up': return UNDOS_BY_DIFFICULTY[difficultyForLevel(ctx.level)];
    case 'challenge': return 0;
  }
};

const contextDeckLimit = (ctx: PlayContext): number | undefined => {
  if (ctx.mode !== 'challenge') return undefined;
  return findChallenge(ctx.id).deckLimit;
};

// No Swap was a challenge mode in the original set; it's now an
// achievement (passive observation), so nothing at this layer needs to
// flip a flag — newGame derives state.noSwap = false on every run and
// the achievement just checks whether the player swapped or not.
const contextNoSwap = (_ctx: PlayContext): boolean => false;

// No Discards remains a playable challenge — when active it hides
// the Discard button and the reducer rejects DISCARD_NONE. Extreme
// difficulty also forces noDiscards on inside newGame.
const contextNoDiscards = (ctx: PlayContext): boolean =>
  ctx.mode === 'challenge' && ctx.id === 'no-discards';

// Short Circuit: the suit perk that fires is randomized. Set the
// state flag here; GameScreen renders a generic perk button and
// handleBeginSuitAction picks a random available perk at fire time.
const contextRandomPerks = (ctx: PlayContext): boolean =>
  ctx.mode === 'challenge' && ctx.id === 'short-circuit';

// Poker Purist + Three Tricks: zero bonus cards in the regular draw
// deck. newGame uses this to empty both the starter hand and the bonus
// deck; GameScreen hides the bonus card strip when this flag is on AND
// the hand is empty. Three Tricks reuses noBonusCards but seeds the
// hand with the three specials via initialBonusCards (below).
const contextNoBonusCards = (ctx: PlayContext): boolean =>
  ctx.mode === 'challenge' &&
  (ctx.id === 'poker-purist' || ctx.id === 'three-tricks');

// Three Tricks: seed the bonus hand with three random one-time action
// cards sampled (no replacement) from SPECIAL_DECK_POOL. newGame uses
// these instead of the normal starter draw when noBonusCards is true.
const contextInitialBonusCards = (ctx: PlayContext): BonusCard[] => {
  if (ctx.mode !== 'challenge' || ctx.id !== 'three-tricks') return [];
  return shuffle(SPECIAL_DECK_POOL, Math.random).slice(0, 3);
};

// Mixed Bag: lock the 3 bonus slots to categories — slot 0 green
// (specials), slot 1 yellow (in-game scoring), slot 2 purple (end-game).
const contextSlotCategories = (ctx: PlayContext): SlotKind[] | undefined => {
  if (ctx.mode !== 'challenge' || ctx.id !== 'mixed-bag') return undefined;
  return ['special', 'in-game', 'end-game'];
};

const GameContainer = ({ context, onHome, onReplay, onAdvance }: GameContainerProps) => {
  const target = contextTarget(context) || undefined;
  // No bonus cards carry between TU levels — the easy/medium free
  // starter is drawn fresh by newGame via STARTER_BONUS_BY_DIFFICULTY.
  // Past supercharged bonus cards (from prior S/SS picks) shuffle into
  // the bonus deck via deckExtras; supercharged grid cards splice into
  // the playing deck via superchargedDeckCards.
  const deckExtras =
    context.mode === 'targets-up' ? context.deckExtras : undefined;
  const superchargedDeckCards =
    context.mode === 'targets-up' ? context.superchargedDeckCards : undefined;
  const { state, dispatch } = useGame(
    contextDifficulty(context),
    target,
    contextDeckLimit(context),
    contextNoSwap(context),
    undefined,
    deckExtras,
    superchargedDeckCards,
    contextNoDiscards(context),
    contextRandomPerks(context),
    contextNoBonusCards(context),
    contextInitialBonusCards(context),
    contextSlotCategories(context)
  );
  if (state.phase.kind === 'game-over') {
    return (
      <ResultScreen
        state={state}
        context={context}
        onHome={onHome}
        onReplay={onReplay}
        onAdvance={onAdvance}
      />
    );
  }
  return (
    <GameScreen
      state={state}
      dispatch={dispatch}
      onHome={onHome}
      kicker={contextKicker(context)}
      maxUndos={contextMaxUndos(context)}
      showTierRewards={context.mode === 'targets-up'}
    />
  );
};

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.bgBase },
  safe: { flex: 1, backgroundColor: colors.bgBase },
  webScalerOuter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    backgroundColor: colors.bgBase,
    overflow: 'hidden',
  },
});
