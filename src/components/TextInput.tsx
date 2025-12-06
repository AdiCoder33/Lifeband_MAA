import React from 'react';
import { StyleSheet, Text, TextInput as RNTextInput, TextInputProps, View } from 'react-native';
import { colors, spacing, typography, radii } from '../theme/theme';

type Props = TextInputProps & {
  label?: string;
  error?: string;
};

const TextInput: React.FC<Props> = ({ label, error, style, ...rest }) => {
  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <RNTextInput
        style={[styles.input, style, error && styles.inputError]}
        placeholderTextColor={colors.textSecondary}
        {...rest}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.md,
  },
  label: {
    marginBottom: spacing.xs,
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.white,
    color: colors.textPrimary,
    fontSize: typography.body,
  },
  inputError: {
    borderColor: colors.critical,
  },
  errorText: {
    marginTop: spacing.xs,
    color: colors.critical,
    fontSize: typography.small,
  },
});

export default TextInput;
