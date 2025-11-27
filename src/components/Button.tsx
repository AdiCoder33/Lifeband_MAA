import React from 'react';
import { ActivityIndicator, GestureResponderEvent, StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native';
import { colors, spacing, typography, radii } from '../theme/theme';

type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'google';

type ButtonProps = {
  title: string;
  onPress: (event: GestureResponderEvent) => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
}) => {
  const isDisabled = disabled || loading;
  const containerStyles = [
    styles.base,
    styles[variant],
    isDisabled && styles.disabled,
    style,
  ];

  const textStyles = [
    styles.text,
    variant === 'outline' || variant === 'ghost' ? styles.textPrimary : styles.textOnPrimary,
    variant === 'google' && styles.textGoogle,
  ];

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={containerStyles}
      onPress={onPress}
      disabled={isDisabled}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'outline' || variant === 'ghost' ? colors.primary : colors.white} />
      ) : (
        <Text style={textStyles}>{title}</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.sm,
  },
  primary: {
    backgroundColor: colors.secondary,
  },
  outline: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.secondary,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  google: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  disabled: {
    opacity: 0.6,
  },
  text: {
    fontSize: typography.body,
    fontWeight: '600',
  },
  textOnPrimary: {
    color: colors.white,
  },
  textPrimary: {
    color: colors.secondary,
  },
  textGoogle: {
    color: colors.textPrimary,
  },
});

export default Button;
