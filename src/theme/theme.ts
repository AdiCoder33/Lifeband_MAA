export const colors = {
  primary: '#E57373', // Calm Rose
  secondary: '#283593', // Deep Indigo
  accent: '#4DB6AC', // Aqua Mint
  background: '#FAFAFA', // Porcelain White
  card: '#F5F5F5', // Soft Grey
  textPrimary: '#1A1A1A',
  textSecondary: '#616161',
  border: '#E0E0E0',
  healthy: '#43A047',
  attention: '#FFA000',
  critical: '#D32F2F',
  white: '#FFFFFF',
  muted: '#BDBDBD',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const typography = {
  heading: 24,
  subheading: 18,
  body: 16,
  small: 14,
};

export const radii = {
  sm: 8,
  md: 12,
  lg: 20,
};

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
};

export const theme = {
  colors,
  spacing,
  typography,
  radii,
  shadows,
};

export type Theme = typeof theme;
