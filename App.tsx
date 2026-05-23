import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Difficulty } from './src/game/rules';
import { useGame } from './src/ui/hooks/useGame';
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

type Screen = 'home' | 'game' | 'settings' | 'stats' | 'rules' | 'tutorial';

const AppShell = () => {
  const [screen, setScreen] = useState<Screen>('home');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
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

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      {screen === 'home' && (
        <HomeScreen
          onStart={d => {
            setDifficulty(d);
            setNonce(n => n + 1);
            setScreen('game');
          }}
          onOpenStats={() => setScreen('stats')}
          onOpenSettings={() => setScreen('settings')}
          onOpenRules={() => setScreen('rules')}
        />
      )}
      {screen === 'game' && (
        <GameContainer
          key={`${difficulty}-${nonce}`}
          difficulty={difficulty}
          onHome={() => setScreen('home')}
          onReplay={() => setNonce(n => n + 1)}
        />
      )}
      {screen === 'stats' && <StatsScreen onBack={() => setScreen('home')} />}
      {screen === 'settings' && <SettingsScreen onBack={() => setScreen('home')} />}
      {screen === 'rules' && (
        <RulesScreen
          onBack={dismissRules}
          onOpenTutorial={() => setScreen('tutorial')}
        />
      )}
      {screen === 'tutorial' && (
        <TutorialScreen onDone={() => setScreen('rules')} />
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
  difficulty: Difficulty;
  onHome: () => void;
  onReplay: () => void;
}

const GameContainer = ({ difficulty, onHome, onReplay }: GameContainerProps) => {
  const { state, dispatch } = useGame(difficulty);
  if (state.phase.kind === 'game-over') {
    return <ResultScreen state={state} onHome={onHome} onReplay={onReplay} />;
  }
  return <GameScreen state={state} dispatch={dispatch} onHome={onHome} />;
};

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.bgBase },
  safe: { flex: 1, backgroundColor: colors.bgBase },
});
