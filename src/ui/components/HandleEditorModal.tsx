// Player handle editor — modal shown when the player taps their
// "Playing as" pill on LandingScreen. The Save button pushes through
// to Supabase via DailyProvider.setHandle, which returns:
//   - 'ok'                  — saved everywhere; close
//   - 'taken'                — show inline error
//   - 'invalid'              — show inline error (validation came from server)
//   - 'backend-unavailable'  — saved locally only; show a warning that
//                              uniqueness wasn't checked
//
// Mirrors the cyan-accent modal aesthetic used across the catalog.

import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { displayNameFor, useDaily } from '../daily/DailyProvider';
import { NeonButton } from './NeonButton';
import { colors, fonts, glow, radius, spacing } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const HANDLE_MAX = 16;

export const HandleEditorModal = ({ visible, onClose }: Props) => {
  const { handle, deviceId, setHandle } = useDaily();
  const [draft, setDraft] = useState<string>(handle ?? '');
  const [status, setStatus] = useState<
    'idle' | 'saving' | 'saved-local' | 'taken' | 'invalid' | 'unavailable'
  >('idle');

  // Re-seed the draft each time the modal opens so reopening always
  // starts from the persisted handle (not whatever the previous edit
  // session was). useEffect would also work; gating on `visible` here
  // keeps it simple.
  React.useEffect(() => {
    if (visible) {
      setDraft(handle ?? '');
      setStatus('idle');
    }
  }, [visible, handle]);

  const onSave = async () => {
    setStatus('saving');
    const next = draft.trim().length === 0 ? null : draft.trim();
    const result = await setHandle(next);
    if (result === 'ok') {
      setStatus('idle');
      onClose();
    } else if (result === 'backend-unavailable') {
      // Saved locally; warn the player that uniqueness wasn't checked.
      setStatus('saved-local');
    } else if (result === 'taken') {
      setStatus('taken');
    } else {
      setStatus('invalid');
    }
  };

  const onClear = async () => {
    setStatus('saving');
    const result = await setHandle(null);
    if (result === 'ok' || result === 'backend-unavailable') {
      setStatus('idle');
      onClose();
    } else {
      setStatus('invalid');
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Display Name</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.closeBtn}>×</Text>
            </Pressable>
          </View>

          <Text style={styles.body}>
            Shown next to your daily score on the leaderboard.
            Leave blank to use the default ({displayNameFor(deviceId, null)}).
          </Text>

          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Anon-3f7c"
            placeholderTextColor={colors.textLow}
            maxLength={HANDLE_MAX}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            editable={status !== 'saving'}
          />
          <Text style={styles.hint}>
            3–16 chars · letters, digits, _ or -
          </Text>

          {status === 'taken' && (
            <Text style={styles.errorLine}>
              That name's already taken. Try another.
            </Text>
          )}
          {status === 'invalid' && (
            <Text style={styles.errorLine}>
              Name doesn't match the format above.
            </Text>
          )}
          {status === 'saved-local' && (
            <Text style={styles.warnLine}>
              Saved on this device. Leaderboard isn't configured, so
              uniqueness wasn't checked.
            </Text>
          )}

          <View style={styles.btnRow}>
            {handle !== null && (
              <NeonButton
                label="Clear"
                variant="secondary"
                size="md"
                onPress={onClear}
                style={{ flex: 1 }}
                disabled={status === 'saving'}
              />
            )}
            <NeonButton
              label={status === 'saving' ? 'Saving…' : 'Save'}
              variant="primary"
              size="md"
              onPress={onSave}
              style={{ flex: 1 }}
              disabled={status === 'saving'}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 4, 12, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.bgPanel,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...glow(colors.accent, 18, 0.3),
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.textHi,
    fontFamily: fonts.mono,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  closeBtn: {
    color: colors.textMid,
    fontSize: 24,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  body: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: spacing.md,
  },
  input: {
    color: colors.textHi,
    fontFamily: fonts.mono,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
    backgroundColor: colors.bgBase,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  hint: {
    color: colors.textLow,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },
  errorLine: {
    color: colors.danger,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: spacing.sm,
    textShadowColor: colors.danger,
    textShadowRadius: 3,
  },
  warnLine: {
    color: colors.warn,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontStyle: 'italic',
    lineHeight: 15,
    marginTop: spacing.sm,
  },
  btnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
