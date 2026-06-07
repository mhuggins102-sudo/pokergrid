// Top-of-screen banner that appears when the running JS bundle is
// older than what's currently deployed. Helps installed PWAs notice
// updates without a manual cache wipe / reinstall.
//
// Web-only. Native builds short-circuit via Platform check.
//
// The banner does not auto-reload — a tap is required — so a player
// mid-game won't lose state to an unwanted refresh. Dismiss button
// hides it for the rest of the session.

import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import { BUILT_VERSION, fetchServerVersion } from '../buildVersion';
import { colors, fonts, spacing } from '../theme';

export const StaleVersionBanner = () => {
  const [outdated, setOutdated] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (BUILT_VERSION === 'dev') return; // skip in local dev
    let cancelled = false;
    fetchServerVersion().then(server => {
      if (cancelled) return;
      if (server && server !== BUILT_VERSION) setOutdated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!outdated || dismissed) return null;

  const reload = () => {
    if (Platform.OS !== 'web') return;
    // Cast: window exists on web only and is not in RN's type surface.
    (globalThis as { location?: { reload?: () => void } }).location?.reload?.();
  };

  return (
    <Pressable style={styles.banner} onPress={reload}>
      <Text style={styles.text}>New version available · tap to reload</Text>
      <Pressable
        onPress={(e) => {
          e.stopPropagation();
          setDismissed(true);
        }}
        hitSlop={6}
        style={styles.dismiss}
      >
        <Text style={styles.dismissText}>×</Text>
      </Pressable>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  text: {
    color: colors.bgBase,
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textAlign: 'center',
  },
  dismiss: {
    position: 'absolute',
    right: spacing.sm,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  dismissText: {
    color: colors.bgBase,
    fontSize: 18,
    fontWeight: '800',
  },
});
