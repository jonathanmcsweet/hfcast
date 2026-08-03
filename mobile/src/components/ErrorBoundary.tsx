import React from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { spacing, typography, uiLight } from '../theme';

interface Props {
  children: ReactNode;
  /** Shown to the reader. Passed in because this cannot use hooks. */
  labels: { title: string; body: string; retry: string; };
}

interface State {
  error: Error | null;
}

/**
 * Stops one broken component from blanking the whole app.
 *
 * React unmounts the entire tree when a render throws and nothing catches
 * it, so a single bad value anywhere leaves a white screen with no message
 * — which is exactly how two crashes reached a running build here. This
 * turns that into something a reader can see and report.
 *
 * A class, because an error boundary cannot be written as a function: React
 * offers no hook for `getDerivedStateFromError`. It is the one place in this
 * app that is not a function component.
 *
 * Deliberately not translated through hooks or themed through `useTheme`.
 * Both would run inside the boundary, and a boundary that depends on the
 * machinery it is protecting cannot report that machinery failing — so the
 * strings arrive as props and the colours are the light palette's constants.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    // The console is the only place this can go. There is no crash
    // reporter, and inventing one is a decision about sending a user's
    // location off the device.
    console.error('render failed', error, info.componentStack);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { labels } = this.props;
    return (
      <View style={styles.centre}>
        <Text style={[typography.cardHeadline, styles.title]}>
          {labels.title}
        </Text>
        <Text style={[typography.body, styles.text]}>{labels.body}</Text>
        {
          /* The message is shown rather than hidden: without a crash
             reporter it is the only description anyone can pass on. */
        }
        <Text style={[typography.caption, styles.detail]}>{error.message}</Text>
        <Button
          mode="contained"
          onPress={() => this.setState({ error: null })}
          style={styles.retry}
        >
          {labels.retry}
        </Button>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: uiLight.page,
  },
  title: { color: uiLight.ink, textAlign: 'center' },
  text: {
    color: uiLight.text2,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  detail: {
    color: uiLight.text3,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  retry: { marginTop: spacing.lg },
});
