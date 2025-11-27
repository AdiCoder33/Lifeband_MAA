import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ScreenContainer from '../../components/ScreenContainer';
import Button from '../../components/Button';
import { colors, spacing, typography } from '../../theme/theme';
import { UserProfile } from '../../types/user';
import { signOutUser } from '../../services/authService';

type Props = {
  profile?: UserProfile | null;
};

const PatientHomePlaceholder: React.FC<Props> = ({ profile }) => {
  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>LifeBand MAA – Patient</Text>
        <Text style={styles.subtitle}>Phase 2 will add vitals and Bluetooth features.</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{profile?.name || 'Patient'}</Text>
        <Text style={styles.cardMeta}>Role: Patient</Text>
      </View>
      <View style={styles.actions}>
        <Button title="Sign Out" variant="outline" onPress={signOutUser} />
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  header: {
    padding: spacing.lg,
  },
  title: {
    fontSize: typography.heading,
    fontWeight: '800',
    color: colors.secondary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.body,
  },
  card: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.card,
    padding: spacing.lg,
    borderRadius: 16,
  },
  cardTitle: {
    fontSize: typography.subheading,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  cardMeta: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
  },
  actions: {
    padding: spacing.lg,
  },
});

export default PatientHomePlaceholder;
