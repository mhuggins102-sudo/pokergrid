import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { SafeAreaView, StyleSheet, View } from 'react-native';
import { Difficulty } from './src/game/rules';
import { useGame } from './src/ui/hooks/useGame';
import { GameScreen } from './src/ui/screens/GameScreen';
import { HomeScreen } from './src/ui/screens/HomeScreen';
import { ResultScreen } from './src/ui/screens/ResultScreen';

type Screen = 'home' | 'game';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  // The game hook is keyed by difficulty + a nonce to fully reset on replay.
  const [nonce, setNonce] = useState(0);
  return (
    <View style={styles.app}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe}>
        {screen === 'home' && (
          <HomeScreen
            onStart={d => {
              setDifficulty(d);
              setNonce(n => n + 1);
              setScreen('game');
            }}
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
      </SafeAreaView>
    </View>
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
  return <GameScreen state={state} dispatch={dispatch} />;
};

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: '#1d2331' },
  safe: { flex: 1 },
});
