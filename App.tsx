import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  ChallengeId,
  findChallenge,
  targetForLevel,
} from './src/game/challenges';
import { Difficulty } from './src/game/rules';
import { useGame } from './src/ui/hooks/useGame';
import { BonusCardsScreen } from './src/ui/screens/BonusCardsScreen';
import { ChallengesScreen } from './src/ui/screens/ChallengesScreen';
import { GameScreen } from './src/ui/screens/GameScreen';
import { HomeScreen } from './src/ui/screens/HomeScreen';
import { ResultScreen } from './src/ui/screens/ResultScreen';
import { RulesScreen } from './src/ui/screens/RulesScreen';
import { SettingsScreen } from './src/ui/screens/SettingsScreen';
import { StatsScreen } from './src/ui/screens/StatsScreen';
import { markTutorialSeen, TutorialScreen, tutorialSeen } from './src/ui/screens/TutorialScreen';
import { SettingsProvider } from './src/ui/settings';
import { StatsProvider } from './src/ui/stats';
import { colors } from './src/ui/theme';

// Play contexts — the "mode" the current run is in. The Game loop itself is
// identical across modes; only the target and the post-game flow differ.
export type PlayContext =
  | { mode: 'free'; difficulty: Difficulty }
  | { mode: 'targets-up'; level: number; wins: number }
  | { mode: 'challenge'; id: ChallengeId };

type Screen =
  | 'home'
  | 'game'
  | 'settings'
  | 'stats'
  | 'rules'
  | 'tutorial'
  | 'bonusCards'
  | 'challenges';

const AppShell = () => {
  const [screen, setScreen] = useState<Screen>('home');
  const [playContext, setPlayContext] = useState<PlayContext | null>(null);
  const [nonce, setNonce] = useState(0);

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
  const startChallenge = (id: ChallengeId) => {
    setPlayContext({ mode: 'challenge', id });
    setNonce(n => n + 1);
    setScreen('game');
  };
  const advanceTargetsUp = () => {
    if (playContext?.mode !== 'targets-up') return;
    setPlayContext({
      mode: 'targets-up',
      level: playContext.level + 1,
      wins: playContext.wins + 1,
    });
    setNonce(n => n + 1);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      {screen === 'home' && (
        <HomeScreen
          onStartFree={startFreePlay}
          onStartTargetsUp={startTargetsUp}
          onOpenChallenges={() => setScreen('challenges')}
          onOpenStats={() => setScreen('stats')}
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
      {screen === 'settings' && <SettingsScreen onBack={() => setScreen('home')} />}
      {screen === 'rules' && (
        <RulesScreen
          onBack={dismissRules}
          onOpenTutorial={() => setScreen('tutorial')}
          onOpenBonusCards={() => setScreen('bonusCards')}
        />
      )}
      {screen === 'tutorial' && (
        <TutorialScreen onDone={() => setScreen('rules')} />
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

export default function App() {
  return (
    <GestureHandlerRootView style={styles.app}>
      <SafeAreaProvider>
        <SettingsProvider>
          <StatsProvider>
            <View style={styles.app}>
              <StatusBar style="light" />
              <AppShell />
            </View>
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
  onAdvance: () => void;
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
    case 'targets-up': {
      // Difficulty tracks the target for the round: easy bands (<400) get
      // easy perks (starter bonus + deck peek), medium bands (400–499) get
      // the medium curve, and high targets (500+) play on hard.
      const t = targetForLevel(ctx.level);
      if (t < 400) return 'easy';
      if (t < 500) return 'medium';
      return 'hard';
    }
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

// Per-mode undo cap. Challenge runs are honor-only: no undo. Targets Up lets
// the player erase one misclick per run. Free play is unrestricted (each undo
// taints the run for stats purposes).
const contextMaxUndos = (ctx: PlayContext): number => {
  switch (ctx.mode) {
    case 'free': return Infinity;
    case 'targets-up': return 1;
    case 'challenge': return 0;
  }
};

const GameContainer = ({ context, onHome, onReplay, onAdvance }: GameContainerProps) => {
  const target = contextTarget(context) || undefined;
  const { state, dispatch } = useGame(contextDifficulty(context), target);
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
    />
  );
};

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.bgBase },
  safe: { flex: 1, backgroundColor: colors.bgBase },
});
