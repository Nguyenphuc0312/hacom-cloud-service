import { theme as antTheme } from 'antd';
import type { ThemeConfig } from 'antd';

export type ThemeMode = 'light' | 'dark';
export type ThemePreference = ThemeMode | 'system';

export const THEME_STORAGE_KEY = 'chat-admin-theme';

export const semanticTokenNames = [
  '--color-bg',
  '--color-bg-canvas',
  '--color-card',
  '--color-card-muted',
  '--color-card-elevated',
  '--color-text-primary',
  '--color-text-secondary',
  '--color-text-tertiary',
  '--color-border',
  '--color-border-subtle',
  '--color-border-strong',
  '--color-accent',
  '--color-success',
  '--color-warning',
  '--color-danger',
  '--color-info',
] as const;

interface ThemeDefinition {
  id: ThemeMode;
  label: string;
  semantic: {
    background: string;
    canvas: string;
    card: string;
    cardMuted: string;
    cardElevated: string;
    textPrimary: string;
    textSecondary: string;
    textTertiary: string;
    border: string;
    borderSubtle: string;
    borderStrong: string;
    accent: string;
    accentStrong: string;
    accentSoft: string;
    success: string;
    warning: string;
    danger: string;
    info: string;
    overlay: string;
  };
  chartPalette: [string, string, string, string];
  chart: {
    grid: string;
    tooltipBackground: string;
    tooltipText: string;
  };
  ant: ThemeConfig;
}

const buildAntTheme = (mode: ThemeMode, tokens: ThemeDefinition['semantic']): ThemeConfig => ({
  algorithm: mode === 'dark' ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
  token: {
    colorPrimary: tokens.accent,
    colorInfo: tokens.info,
    colorSuccess: tokens.success,
    colorWarning: tokens.warning,
    colorError: tokens.danger,
    colorBgLayout: tokens.background,
    colorBgContainer: tokens.card,
    colorBgElevated: tokens.cardElevated,
    colorBorder: tokens.border,
    colorBorderSecondary: tokens.borderSubtle,
    colorText: tokens.textPrimary,
    colorTextSecondary: tokens.textSecondary,
    colorTextTertiary: tokens.textTertiary,
    colorFillSecondary: tokens.cardMuted,
    borderRadius: 16,
    borderRadiusLG: 22,
    controlHeight: 42,
    controlHeightLG: 48,
    fontSize: 14,
    fontSizeHeading3: 24,
    lineHeight: 1.55,
    wireframe: false,
    fontFamily:
      'Aptos, Segoe UI Variable Text, Segoe UI, SF Pro Text, Helvetica Neue, sans-serif',
  },
  components: {
    Layout: {
      bodyBg: tokens.background,
      headerBg: tokens.card,
      siderBg: tokens.card,
      triggerBg: tokens.cardMuted,
    },
    Button: {
      defaultBorderColor: tokens.border,
      defaultColor: tokens.textSecondary,
      defaultBg: tokens.card,
      primaryShadow: 'none',
    },
    Card: {
      colorBgContainer: tokens.card,
    },
    Modal: {
      contentBg: tokens.card,
      headerBg: tokens.card,
    },
    Drawer: {
      colorBgElevated: tokens.card,
    },
    Table: {
      headerBg: tokens.cardMuted,
      borderColor: tokens.borderSubtle,
      rowHoverBg: tokens.cardMuted,
    },
    Tooltip: {
      colorBgSpotlight: tokens.overlay,
    },
  },
});

const lightSemantic: ThemeDefinition['semantic'] = {
  background: '#f3f6fb',
  canvas: '#e9eff7',
  card: '#ffffff',
  cardMuted: '#f7f9fc',
  cardElevated: '#fcfdff',
  textPrimary: '#0f172a',
  textSecondary: '#334155',
  textTertiary: '#6b7a90',
  border: '#d7e1ee',
  borderSubtle: '#e5edf6',
  borderStrong: '#bcc9da',
  accent: '#3154ff',
  accentStrong: '#2542db',
  accentSoft: 'rgba(49, 84, 255, 0.14)',
  success: '#139b6d',
  warning: '#d58b24',
  danger: '#df5b57',
  info: '#2a9fd6',
  overlay: 'rgba(8, 15, 28, 0.52)',
};

const darkSemantic: ThemeDefinition['semantic'] = {
  background: '#08111f',
  canvas: '#0d1728',
  card: '#101c2f',
  cardMuted: '#132239',
  cardElevated: '#18273f',
  textPrimary: '#f4f7ff',
  textSecondary: '#cad5e6',
  textTertiary: '#91a5bf',
  border: '#263752',
  borderSubtle: '#1c2b44',
  borderStrong: '#3b5170',
  accent: '#7aa2ff',
  accentStrong: '#a5c1ff',
  accentSoft: 'rgba(122, 162, 255, 0.18)',
  success: '#4cd1a1',
  warning: '#f4b665',
  danger: '#ff817a',
  info: '#6fd3ff',
  overlay: 'rgba(3, 8, 18, 0.74)',
};

export const themeDefinitions: Record<ThemeMode, ThemeDefinition> = {
  light: {
    id: 'light',
    label: 'Light',
    semantic: lightSemantic,
    chartPalette: ['#3154ff', '#1fa28a', '#7867ff', '#e58a3a'],
    chart: {
      grid: 'rgba(107, 122, 144, 0.18)',
      tooltipBackground: 'rgba(15, 23, 42, 0.92)',
      tooltipText: '#f8fafc',
    },
    ant: buildAntTheme('light', lightSemantic),
  },
  dark: {
    id: 'dark',
    label: 'Dark',
    semantic: darkSemantic,
    chartPalette: ['#7aa2ff', '#46d7be', '#b6a3ff', '#ffb86b'],
    chart: {
      grid: 'rgba(145, 165, 191, 0.2)',
      tooltipBackground: 'rgba(6, 11, 21, 0.96)',
      tooltipText: '#f4f7ff',
    },
    ant: buildAntTheme('dark', darkSemantic),
  },
};

export const resolveStoredThemePreference = (): ThemePreference => {
  if (typeof window === 'undefined') {
    return 'system';
  }

  const storedValue = window.localStorage.getItem(THEME_STORAGE_KEY);
  return storedValue === 'light' || storedValue === 'dark' ? storedValue : 'system';
};

export const resolveSystemTheme = (): ThemeMode => {
  if (typeof window === 'undefined') {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const resolveThemeMode = (preference: ThemePreference, systemTheme: ThemeMode): ThemeMode =>
  preference === 'system' ? systemTheme : preference;

export const getThemeDefinition = (mode: ThemeMode) => themeDefinitions[mode];
