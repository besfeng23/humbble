import { Stack } from 'expo-router';
import React from 'react';

import { NotFoundView } from '@/components/routing/NotFoundView';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Page not found', headerShown: false }} />
      <NotFoundView />
    </>
  );
}
