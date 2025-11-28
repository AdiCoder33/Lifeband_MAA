import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import { LifeBandProvider } from './src/context/LifeBandContext';

export default function App() {
  return (
    <LifeBandProvider>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </SafeAreaProvider>
    </LifeBandProvider>
  );
}
