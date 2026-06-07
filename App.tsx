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
import { seededRng, shuffle } from './src/game/deck';
import { Card } from './src/game/cards';
import {
  ChallengeId,
  difficultyForLevel,
  findChallenge,
  targetForLevel,
} from './src/game/challenges';
import { DailyRecipe, recipeFor } from './src/game/daily/recipe';
import { seedForDate } from './src/game/daily/seed';
import { Difficulty, TARGET_BY_DIFFICULTY, UNDOS_BY_DIFFICULTY } from './src/game/rules';
import { useGame } from './src/ui/hooks/useGame';
import { BonusCardsScreen } from './src/ui/screens/BonusCardsScreen';
import { ChallengesScreen } from './src/ui/screens/ChallengesScreen';
import { DailyArchiveScreen } from './src/ui/screens/DailyArchiveScreen';
import { GameScreen } from './src/ui/screens/GameScreen';
import { HomeScreen } from './src/ui/screens/HomeScreen';
import { LandingScreen } from './src/ui/screens/LandingScreen';
import { ResultScreen } from './src/ui/screens/ResultScreen';
import { RulesScreen } from './src/ui/screens/RulesScreen';
import { SettingsScreen } from './src/ui/screens/SettingsScreen';
import { AchievementsScreen } from './src/ui/screens/AchievementsScreen';
import { StatsScreen } from './src/ui/screens/StatsScreen';
import { markTutorialSeen, TutorialScreen, tutorialSeen } from './src/ui/screens/TutorialScreen';
import { StaleVersionBanner } from './src/ui/components/StaleVersionBanner';
import { DailyProvider, useDaily } from './src/ui/daily/DailyProvider';
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
  | { mode: 'challenge'; id: ChallengeId }
  // Daily Grid: deterministic from dateISO via seededRng(seedForDate(dateISO)).
  // recipe is captured at game start so a recipe-config change between
  // start and game-over doesn't reshape mid-run.
  | { mode: 'daily'; dateISO: string; recipe: DailyRecipe };

type Screen =
  | 'landing'
  | 'home'
  | 'game'
  | 'daily-result'
  | 'daily-archive'
  | 'settings'
  | 'stats'
  | 'achievements'
  | 'rules'
  | 'tutorial'
  | 'bonusCards'
  | 'challenges';

const AppShell = () => {
  const [screen, setScreen] = useState<Screen>('landing');
  const [playContext, setPlayContext] = useState<PlayContext | null>(null);
  const [nonce, setNonce] = useState(0);
  // Where the tutorial should return to when finished. First-run / Rules flow
  // returns to 'rules'; launching it from Settings → "Replay tutorial" returns
  // to 'settings'.
  const [tutorialReturn, setTutorialReturn] = useState<Screen>('rules');
  // Rules and Settings can be opened from either Landing or Free Play home.
  // Back should land the player where they came from. First-run rules dismiss
  // uses the default ('landing') so a brand-new player ends up at the entry
  // screen the rest of the app revolves around.
  const [rulesReturn, setRulesReturn] = useState<Screen>('landing');
  const [settingsReturn, setSettingsReturn] = useState<Screen>('landing');
  const { save: tuSave } = useTUSave();
  const daily = useDaily();

  // First-run: pop up the single-page Rules. Mark seen on dismiss so we
  // don't show it again. The user can re-open from Home → How to Play.
  useEffect(() => {
    tutorialSeen().then(seen => {
      if (!seen) setScreen('rules');
    });
  }, []);

  // Rules dismiss returns the player to wherever they opened Rules
  // from. First-run / landing-launch defaults to 'landing'; opening
  // from Free Play home pre-sets rulesReturn='home' so Back lands
  // there. markTutorialSeen is idempotent — fine to call on every
  // dismiss.
  const dismissRules = () => {
    markTutorialSeen();
    setScreen(rulesReturn);
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
  // Both daily entry points accept an optional dateISO so the archive
  // can replay past dates the same way LandingScreen launches today's
  // daily. When omitted we fall back to today.
  const startDaily = (dateISO?: string) => {
    const targetDate = dateISO ?? daily.todayISO;
    // Lock the date + recipe at commit time so a session crossing
    // UTC midnight submits under the start date and a recipe-config
    // change can't reshape the run mid-play.
    setPlayContext({
      mode: 'daily',
      dateISO: targetDate,
      recipe: recipeFor(targetDate),
    });
    setNonce(n => n + 1);
    setScreen('game');
  };
  const openDailyResult = (dateISO?: string) => {
    // Re-entry path for a completed daily. The daily-result screen
    // reads the stored GameState from DailyProvider's plays map.
    const targetDate = dateISO ?? daily.todayISO;
    setPlayContext({
      mode: 'daily',
      dateISO: targetDate,
      recipe: recipeFor(targetDate),
    });
    setScreen('daily-result');
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

  // Daily-mode home button routes back to landing (where the player
  // launched the daily from). Other modes return to the Free Play home,
  // which is itself a sub-screen of landing now.
  const homeForContext = (ctx: PlayContext): Screen =>
    ctx.mode === 'daily' ? 'landing' : 'home';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <StaleVersionBanner />
      {screen === 'landing' && (
        <LandingScreen
          onStartDaily={() => startDaily()}
          onOpenFreePlay={() => setScreen('home')}
          onOpenDailyResult={() => openDailyResult()}
          onOpenDailyArchive={() => setScreen('daily-archive')}
          onOpenRules={() => {
            setRulesReturn('landing');
            setScreen('rules');
          }}
          onOpenSettings={() => {
            setSettingsReturn('landing');
            setScreen('settings');
          }}
        />
      )}
      {screen === 'daily-archive' && (
        <DailyArchiveScreen
          onBack={() => setScreen('landing')}
          onStartDaily={(dateISO) => startDaily(dateISO)}
          onOpenResult={(dateISO) => openDailyResult(dateISO)}
        />
      )}
      {screen === 'home' && (
        <HomeScreen
          onStartFree={startFreePlay}
          onStartTargetsUp={startTargetsUp}
          onContinueTargetsUp={continueTargetsUp}
          onOpenChallenges={() => setScreen('challenges')}
          onOpenStats={() => setScreen('stats')}
          onOpenAchievements={() => setScreen('achievements')}
          onOpenSettings={() => {
            setSettingsReturn('home');
            setScreen('settings');
          }}
          onOpenRules={() => {
            setRulesReturn('home');
            setScreen('rules');
          }}
          onBack={() => setScreen('landing')}
        />
      )}
      {screen === 'game' && playContext && (
        <GameContainer
          key={`${nonce}`}
          context={playContext}
          onHome={() => setScreen(homeForContext(playContext))}
          onReplay={() => setNonce(n => n + 1)}
          onAdvance={advanceTargetsUp}
        />
      )}
      {screen === 'daily-result' && playContext?.mode === 'daily' && (
        <DailyResultContainer
          context={playContext}
          onHome={() => setScreen('landing')}
        />
      )}
      {screen === 'stats' && <StatsScreen onBack={() => setScreen('home')} />}
      {screen === 'achievements' && (
        <AchievementsScreen onBack={() => setScreen('home')} />
      )}
      {screen === 'settings' && (
        <SettingsScreen
          onBack={() => setScreen(settingsReturn)}
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
              <DailyProvider>
                <WebScaler>
                  <View style={styles.app}>
                    <StatusBar style="light" />
                    <AppShell />
                  </View>
                </WebScaler>
              </DailyProvider>
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
    // Daily uses the standard per-difficulty target. When a twist is
    // rolled, the twist's challenge target REPLACES the difficulty
    // target — so a Daily Easy · Poker Purist run has the same 350
    // target as the Poker Purist Challenge. (Players see this in the
    // rules modal before committing.)
    case 'daily':
      if (ctx.recipe.twist) return findChallenge(ctx.recipe.twist).scoreTarget;
      return TARGET_BY_DIFFICULTY[ctx.recipe.difficulty];
  }
};

const contextDifficulty = (ctx: PlayContext): Difficulty => {
  switch (ctx.mode) {
    case 'free': return ctx.difficulty;
    case 'targets-up': return difficultyForLevel(ctx.level);
    case 'challenge': return 'hard';
    case 'daily': return ctx.recipe.difficulty;
  }
};

// Returns the active twist / challenge id when one applies. Daily
// runs with a twist behave structurally identical to the same-named
// Challenge — same flag plumbing for noDiscards / randomPerks /
// noBonusCards / slotCategories / randomGridFill — so every per-id
// check below routes through this helper.
const effectiveTwist = (ctx: PlayContext): ChallengeId | null => {
  if (ctx.mode === 'challenge') return ctx.id;
  if (ctx.mode === 'daily' && ctx.recipe.twist) return ctx.recipe.twist;
  return null;
};

const contextKicker = (ctx: PlayContext): string | undefined => {
  switch (ctx.mode) {
    case 'free': return ctx.difficulty.toUpperCase();
    case 'targets-up': return `LEVEL ${ctx.level} · TARGETS UP`;
    case 'challenge': {
      const c = findChallenge(ctx.id);
      return `CHALLENGE · ${c.name.toUpperCase()}`;
    }
    case 'daily': {
      if (ctx.recipe.twist) {
        const c = findChallenge(ctx.recipe.twist);
        return `DAILY · ${c.name.toUpperCase()}`;
      }
      return `DAILY · ${ctx.dateISO}`;
    }
  }
};

// Per-mode undo cap. Challenge runs are honor-only: no undo. Targets Up
// inherits the cap from the Free Play difficulty its current level
// maps to via difficultyForLevel — so L1–6 (Easy / Medium bands) get
// the 1-undo cap, and L7+ (Hard band) match Free Play Hard's no-undo
// rule. Free Play itself reads straight from UNDOS_BY_DIFFICULTY.
// Daily Grid grants exactly 1 free undo regardless of underlying
// difficulty (locked decision) so even Extreme dailies are recoverable
// from a single misclick — using it does NOT taint the score.
const contextMaxUndos = (ctx: PlayContext): number => {
  switch (ctx.mode) {
    case 'free': return UNDOS_BY_DIFFICULTY[ctx.difficulty];
    case 'targets-up': return UNDOS_BY_DIFFICULTY[difficultyForLevel(ctx.level)];
    case 'challenge': return 0;
    case 'daily': return 1;
  }
};

const contextDeckLimit = (ctx: PlayContext): number | undefined => {
  if (ctx.mode === 'challenge') return findChallenge(ctx.id).deckLimit;
  if (effectiveTwist(ctx) === 'short-deck') return 45;
  return undefined;
};

// No Swap was a challenge mode in the original set; it's now an
// achievement (passive observation), so nothing at this layer needs to
// flip a flag — newGame derives state.noSwap = false on every run and
// the achievement just checks whether the player swapped or not.
const contextNoSwap = (_ctx: PlayContext): boolean => false;

// No Discards: hide the Discard button and reject DISCARD_NONE in
// the reducer. Extreme difficulty also forces noDiscards on inside
// newGame so a Daily Extreme is no-discards regardless of twist.
const contextNoDiscards = (ctx: PlayContext): boolean =>
  effectiveTwist(ctx) === 'no-discards';

// Short Circuit: the suit perk that fires is randomized. Set the
// state flag here; GameScreen renders a generic perk button and
// handleBeginSuitAction picks a random available perk at fire time.
const contextRandomPerks = (ctx: PlayContext): boolean =>
  effectiveTwist(ctx) === 'short-circuit';

// Poker Purist + Three Tricks: zero bonus cards in the regular draw
// deck. newGame uses this to empty both the starter hand and the bonus
// deck; GameScreen hides the bonus card strip when this flag is on AND
// the hand is empty. Three Tricks reuses noBonusCards but seeds the
// hand with the three specials via initialBonusCards (below).
const contextNoBonusCards = (ctx: PlayContext): boolean => {
  const t = effectiveTwist(ctx);
  return t === 'poker-purist' || t === 'three-tricks';
};

// Three Tricks: seed the bonus hand with three random one-time action
// cards sampled (no replacement) from SPECIAL_DECK_POOL. newGame uses
// these instead of the normal starter draw when noBonusCards is true.
const contextInitialBonusCards = (ctx: PlayContext): BonusCard[] => {
  if (effectiveTwist(ctx) !== 'three-tricks') return [];
  return shuffle(SPECIAL_DECK_POOL, Math.random).slice(0, 3);
};

// Mixed Bag: lock the 3 bonus slots to categories — slot 0 green
// (specials), slot 1 yellow (in-game scoring), slot 2 purple (end-game).
const contextSlotCategories = (ctx: PlayContext): SlotKind[] | undefined => {
  if (effectiveTwist(ctx) !== 'mixed-bag') return undefined;
  return ['special', 'in-game', 'end-game'];
};

// Gridlock: scatter 15 cards across random grid positions before
// play begins. The remaining 10 slots fill in via the normal spiral
// during the run.
const contextRandomGridFill = (ctx: PlayContext): number => {
  if (effectiveTwist(ctx) !== 'gridlock') return 0;
  return 15;
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
  // Daily Grid: every player worldwide gets the same deck order on the
  // same UTC day via seededRng(seedForDate(dateISO)). Other modes pass
  // undefined so newGame falls back to Math.random.
  const rng =
    context.mode === 'daily'
      ? seededRng(seedForDate(context.dateISO))
      : undefined;
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
    contextSlotCategories(context),
    contextRandomGridFill(context),
    rng
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
      animateInitialPlacement={contextRandomGridFill(context) > 0}
    />
  );
};

// Re-entry path for an already-completed daily. Pulls the stored
// GameState from the DailyProvider's plays map and re-renders the
// regular ResultScreen with it. The Replay / Advance callbacks are
// no-ops because daily mode forbids replays and isn't tied to TU
// progression.
interface DailyResultContainerProps {
  context: Extract<PlayContext, { mode: 'daily' }>;
  onHome: () => void;
}

const DailyResultContainer = ({ context, onHome }: DailyResultContainerProps) => {
  const { plays } = useDaily();
  const play = plays?.[context.dateISO];
  if (!play) {
    // Plays map not yet hydrated, or the play vanished from storage
    // between the landing-screen click and this render. LandingScreen
    // only routes here when plays[date] exists, so this branch is a
    // safety net rather than a normal path.
    return <View style={styles.app} />;
  }
  return (
    <ResultScreen
      state={play.state}
      context={context}
      onHome={onHome}
      onReplay={() => {}}
      onAdvance={() => {}}
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
