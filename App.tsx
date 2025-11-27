import React from 'react';
import { StatusBar } from 'expo-status-bar';
import RootNavigator from './src/navigation/RootNavigator';
import { LifeBandProvider } from './src/context/LifeBandContext';

export default function App() {
  return (
    <LifeBandProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </LifeBandProvider>
  );
}
