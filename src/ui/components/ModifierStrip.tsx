import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Modifier } from '../../game/modifiers';

interface Props {
  modifiers: Modifier[];
}

export const ModifierStrip = ({ modifiers }: Props) => (
  <View style={styles.wrap}>
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
    >
      {modifiers.map(m => (
        <View key={m.id} style={styles.chip}>
          <Text style={styles.desc} numberOfLines={1}>
            {m.description}
          </Text>
        </View>
      ))}
    </ScrollView>
  </View>
);

const styles = StyleSheet.create({
  wrap: { paddingVertical: 4 },
  strip: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  chip: {
    backgroundColor: '#f1efe6',
    borderColor: '#d6cfa7',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  desc: { fontSize: 12, color: '#5d4f1a', fontWeight: '600' },
});
