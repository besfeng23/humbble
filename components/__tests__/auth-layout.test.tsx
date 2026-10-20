import React from 'react';
import renderer from 'react-test-renderer';
import AuthStackLayout from '@/app/auth/_layout';

jest.mock('expo-router', () => {
  const Native = require('react-native');
  const Stack: any = ({ children, screenOptions }: any) => (
    <Native.View testID="auth-stack" accessibilityHint={JSON.stringify(screenOptions)}>
      {children}
    </Native.View>
  );
  Stack.Screen = ({ name, options }: any) => (
    <Native.Text testID={`auth-screen-${name}`} accessibilityHint={JSON.stringify(options ?? {})} />
  );
  return { Stack };
});

describe('authentication navigation chrome', () => {
  test('hides headers and shadows on the auth stack', () => {
    const tree = renderer.create(<AuthStackLayout />);
    const stack = tree.root.findByProps({ testID: 'auth-stack' });
    const options = JSON.parse(stack.props.accessibilityHint);
    expect(options.headerShown).toBe(false);
    expect(options.headerShadowVisible).toBe(false);
  });

  test('registers only the intended auth routes', () => {
    const tree = renderer.create(<AuthStackLayout />);
    const names = Array.from(new Set(tree.root.findAll((node) => Boolean(node.props.testID?.startsWith('auth-screen-')))
      .map((node) => node.props.testID.replace('auth-screen-', ''))));
    expect(names).toEqual(['signin', 'signup', 'recovery', 'callback', 'reset-password', 'check-email', 'preview']);
  });
});
