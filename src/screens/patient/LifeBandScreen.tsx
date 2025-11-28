import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ScreenContainer from '../../components/ScreenContainer';
import Button from '../../components/Button';
import { colors, spacing, typography, radii } from '../../theme/theme';
import { useLifeBand } from '../../context/LifeBandContext';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PatientStackParamList } from '../../types/navigation';

type Props = NativeStackScreenProps<PatientStackParamList, 'LifeBand'>;

const LifeBandScreen: React.FC<Props> = () => {
  const { lifeBandState, connecting, connectLifeBand, disconnect, reconnectIfKnownDevice } = useLifeBand();

  useEffect(() => {
    reconnectIfKnownDevice();
  }, [reconnectIfKnownDevice]);

  const status = lifeBandState.connectionState;
  const deviceName = lifeBandState.device?.name || lifeBandState.device?.id || 'Unknown device';

  return (
    <ScreenContainer scrollable>
      <Text style={styles.title}>LifeBand</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Status</Text>
        <Text style={styles.status}>{status.toUpperCase()}</Text>
        {lifeBandState.lastError ? <Text style={styles.error}>{lifeBandState.lastError}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Device</Text>
        <Text style={styles.body}>{lifeBandState.device ? deviceName : 'Not linked yet'}</Text>
        <Text style={styles.helper}>Keep the band nearby to connect.</Text>
      </View>

      <View style={styles.actions}>
        {status === 'connected' ? (
          <Button title="Disconnect" onPress={disconnect} loading={connecting} />
        ) : (
          <Button title="Scan & Connect" onPress={connectLifeBand} loading={connecting} />
        )}
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  title: {
    fontSize: typography.heading,
    fontWeight: '800',
    color: colors.secondary,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  card: {
    backgroundColor: colors.card,
    marginHorizontal: 0,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
  },
  cardTitle: {
    fontSize: typography.subheading,
    fontWeight: '700',
    marginBottom: spacing.xs,
    color: colors.textPrimary,
  },
  status: {
    fontWeight: '800',
    color: colors.textPrimary,
    fontSize: typography.body,
  },
  body: {
    color: colors.textPrimary,
    fontSize: typography.body,
  },
  helper: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xs,
  },
  error: {
    marginTop: spacing.xs,
    color: colors.critical,
  },
  actions: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
});

export default LifeBandScreen;
