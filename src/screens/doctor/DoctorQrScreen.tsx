import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ScreenContainer from '../../components/ScreenContainer';
import QRCode from 'react-native-qrcode-svg';
import { colors, spacing, typography, radii } from '../../theme/theme';
import { auth } from '../../services/firebase';
import { UserProfile } from '../../types/user';

type Props = {
  profile?: UserProfile | null;
};

const DoctorQrScreen: React.FC<Props> = ({ profile }) => {
  const uid = auth.currentUser?.uid || '';
  return (
    <ScreenContainer>
      <View style={styles.card}>
        <Text style={styles.title}>Share with your patient</Text>
        <Text style={styles.copy}>Ask your patient to scan this code to link with you.</Text>
        <View style={styles.qrWrapper}>
          <QRCode value={uid} size={200} color={colors.secondary} />
        </View>
        <Text style={styles.name}>Dr. {profile?.name || 'Doctor'}</Text>
        <Text style={styles.copy}>{profile?.doctorData?.hospital || ''}</Text>
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    margin: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.lg,
    alignItems: 'center',
  },
  title: {
    fontSize: typography.subheading,
    fontWeight: '800',
    color: colors.secondary,
    marginBottom: spacing.xs,
  },
  copy: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  qrWrapper: {
    padding: spacing.lg,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    marginVertical: spacing.sm,
  },
  name: {
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
});

export default DoctorQrScreen;
