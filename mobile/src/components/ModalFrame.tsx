import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { IconButton, Modal, Portal, Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';

/**
 * Material's compact breakpoint. Below it a dialog fills the screen;
 * above it a dialog is a card with the screen behind it.
 */
export const COMPACT_WIDTH = 600;

interface Props {
  visible: boolean;
  onDismiss: () => void;
  title: string;
  /**
   * Back where the changes are already applied, close where something
   * still has to confirm them. Material reads the two differently, and so
   * do people: an arrow says "go back", a cross says "drop this".
   *
   * `none` offers no way out at all, and a tap outside does nothing
   * either. For a dialog that is showing a job it would keep running.
   */
  leave?: 'back' | 'close' | 'none';
  /**
   * The action that confirms the task, where there is one.
   *
   * A full screen carries it in the bar beside the title, which is what
   * Material asks for and what a phone shows: the cross beside it is
   * already the way out, so a footer would say cancel twice. A card
   * carries `footer` instead, where there is room for both words.
   */
  action?: ReactNode;
  /**
   * A control that sits beside the title in both layouts, for something
   * the screen offers rather than something it confirms. Copying a
   * measurement is one; saving a station is not.
   */
  tool?: ReactNode;
  /** Pinned under the content of a card, out of the scroll. */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * The frame every dialog in the app sits in.
 *
 * A phone gets the whole screen, a tablet or a wide browser gets a card.
 * Material asks for this: a task with several inputs and a scroll is a
 * full-screen dialog on a small screen, and a card only where there is
 * room for the screen to stay visible behind it. Four dialogs were a
 * 560-point card whatever they were opened on, which on a phone is a
 * cramped window over a page nobody can reach.
 *
 * The safe-area inset is added only when the frame fills the screen. A
 * card sits inside the insets already.
 */
export default function ModalFrame(
  {
    visible,
    onDismiss,
    title,
    leave = 'close',
    action,
    tool,
    footer,
    children,
  }: Props,
) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const ui = theme.colors.ui;

  const full = width < COMPACT_WIDTH;

  const shell = full
    ? [styles.full, {
      paddingTop: insets.top + spacing.sm,
      paddingBottom: insets.bottom,
    }]
    : styles.card;

  const held = leave === 'none';
  const icon = leave === 'back' ? 'arrow-left' : 'close';
  const label = leave === 'back' ? t('common.back') : t('common.close');

  const leaveButton = held ? null : (
    <IconButton
      icon={icon}
      onPress={onDismiss}
      accessibilityLabel={label}
      iconColor={ui.text2}
    />
  );

  return (
    <Portal>
      <Modal
        visible={visible}
        dismissable={!held}
        {...(held ? {} : { onDismiss })}
        // A full frame has nothing behind it to dim, and the dim layer
        // would sit over the safe area as a grey band.
        style={full ? styles.noBackdrop : undefined}
        contentContainerStyle={[shell, {
          backgroundColor: theme.colors.surface,
        }]}
      >
        {
          /* Icon first when it is the whole screen, which is where a back
             arrow belongs; beside the title otherwise. */
        }
        <View style={[styles.headerRow, full ? styles.headerFull : null]}>
          {full ? leaveButton : null}
          <Text
            style={[
              typography.cardHeadline,
              styles.title,
              full ? styles.titleFull : null,
              { color: ui.ink },
            ]}
          >
            {title}
          </Text>
          {tool}
          {full ? action : null}
          {full ? null : leaveButton}
        </View>

        <View style={[styles.body, full ? styles.bodyFull : null]}>
          {children}
        </View>

        {full ? null : footer}
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  card: {
    margin: spacing.lg,
    marginVertical: spacing.xxl,
    maxWidth: 560,
    alignSelf: 'center',
    width: '90%',
    borderRadius: radius.card,
    padding: spacing.lg,
    maxHeight: '85%',
  },
  full: {
    flex: 1,
    margin: 0,
    width: '100%',
    borderRadius: 0,
    paddingHorizontal: spacing.lg,
  },
  noBackdrop: { backgroundColor: 'transparent' },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  // The icon carries its own padding, so the row loses the matching
  // margin rather than sitting further in than the content below it.
  headerFull: { marginLeft: -spacing.sm },
  title: { flex: 1 },
  titleFull: { marginLeft: spacing.xs },
  body: { flex: 1 },
  bodyFull: { flex: 1 },
});
