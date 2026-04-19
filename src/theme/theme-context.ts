import { createContext, useContext } from 'react';

import type { getThemeDefinition, ThemeMode, ThemePreference } from './tokens';

export interface ThemeContextValue {
  theme: ThemeMode;
  preference: ThemePreference;
  setTheme: (nextTheme: ThemePreference) => void;
  toggleTheme: () => void;
  isDark: boolean;
  tokens: ReturnType<typeof getThemeDefinition>;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export const useTheme = () => {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }

  return context;
};
