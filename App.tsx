import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Difficulty } from './src/game/rules';
import { useGame } from './src/ui/hooks/useGame';
import { GameScreen } from './src/ui/screens/GameScreen';
import { HomeScreen } from './src/ui/screens/HomeScreen';
import { ResultScreen } from './src/ui/screens/ResultScreen';
import { SettingsScreen } from './src/ui/screens/SettingsScreen';
import { StatsScreen } from './src/ui/screens/StatsScreen';
import { TutorialScreen, tutorialSeen } from './src/ui/screens/TutorialScreen';
import { SettingsProvider } from './src/ui/settings';
import { StatsProvider } from './src/ui/stats';
import { colors } from './src/ui/theme';

type Screen = 'home' | 'game' | 'settings' | 'stats' | 'tutorial';

const AppShell = () => {
  const [screen, setScreen] = useState<Screen>('home');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [nonce, setNonce] = useState(0);

  // First-run tutorial.
  useEffect(() => {
    tutorialSeen().then(seen => {
      if (!seen) setScreen('tutorial');
    });
  }, []);

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
          onOpenTutorial={() => setScreen('tutorial')}
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
      {screen === 'tutorial' && <TutorialScreen onDone={() => setScreen('home')} />}
    </SafeAreaView>
  );
};

export default function App() {
  return (
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
