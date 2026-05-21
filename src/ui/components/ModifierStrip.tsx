import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Modifier } from '../../game/modifiers';

interface Props {
  modifiers: Modifier[];
}

export const ModifierStrip = ({ modifiers }: Props) => (
  <View style={styles.strip}>
    {modifiers.map(m => (
      <View key={m.id} style={styles.chip}>
        <Text style={styles.label}>{m.label}</Text>
        <Text style={styles.desc}>{m.description}</Text>
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  chip: {
    backgroundColor: '#f1efe6',
    borderColor: '#d6cfa7',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 100,
    maxWidth: 130,
  },
  label: { fontSize: 11, fontWeight: '700', color: '#5d4f1a' },
  desc: { fontSize: 10, color: '#776230' },
});
