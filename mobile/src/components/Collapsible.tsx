import { type ReactNode, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { Text, TouchableRipple, useTheme } from 'react-native-paper';
import { face, radius, spacing, typography } from '../theme';
import type { AppTheme } from '../theme';
import { Card } from './Card';

interface Props {
  title: string;
  children: ReactNode;
  /** Open on first render. Supporting detail starts closed. */
  defaultOpen?: boolean;
  /**
   * A short status word that stays visible while collapsed — how old the
   * data is. Hiding it behind the caret would let a stale reading pass for
   * a current one, which is the failure this app most has to avoid.
   */
  tag?: string | undefined;
  /** Draws the tag in amber, for a reading that is no longer current. */
  tagStale?: boolean;
  style?: ViewStyle | undefined;
}

/**
 * A card whose body can be folded away.
 *
 * No animation. A section that grows or shrinks under the reader's finger
 * moves everything below it, and the caret plus the disappearing body already
 * say what happened.
 */
export default function Collapsible({
  title,
  children,
  defaultOpen = false,
  tag,
  tagStale = false,
  style,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const theme = useTheme<AppTheme>();
  const ui = theme.colors.ui;

  return (
    <Card style={style}>
      <TouchableRipple
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.header}
      >
        <View style={styles.headerRow}>
          <Text style={[typography.cardTitle, { color: ui.ink }]}>
            {title}
          </Text>
          {tag
            ? (
              <View
                style={[styles.tag, {
                  backgroundColor: tagStale ? ui.amberBg : ui.inset,
                }]}
              >
                <Text
                  style={[typography.label, {
                    color: tagStale ? ui.amberFg : ui.text3,
                  }]}
                >
                  {tag}
                </Text>
              </View>
            )
            : null}
          {
            /* A plus and a minus rather than a rotating chevron: the sign
               says what the tap will do, and it needs no animation to be
               understood. */
          }
          <Text style={[styles.caret, { color: ui.accent }]}>
            {open ? '−' : '+'}
          </Text>
        </View>
      </TouchableRipple>
      {open ? <View style={styles.body}>{children}</View> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  // Negative margin pulls the ripple out to the card's own edges, so the
  // whole header is the touch target rather than just the text.
  header: {
    marginHorizontal: -spacing.lg,
    marginTop: -spacing.lg,
    marginBottom: -spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.card,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 32,
  },
  tag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  caret: {
    marginStart: 'auto',
    fontSize: 13,
    lineHeight: 18,
    fontFamily: face.bold,
  },
  body: {},
});
