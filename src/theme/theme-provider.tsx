import { App as AntdApp, ConfigProvider } from 'antd';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';

import { ThemeContext } from './theme-context';
import {
  THEME_STORAGE_KEY,
  getThemeDefinition,
  resolveStoredThemePreference,
  resolveSystemTheme,
  resolveThemeMode,
  type ThemeMode,
  type ThemePreference,
} from './tokens';

const useSafeLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export const ThemeProvider = ({ children }: PropsWithChildren) => {
  const [preference, setPreference] = useState<ThemePreference>(resolveStoredThemePreference);
  const [systemTheme, setSystemTheme] = useState<ThemeMode>(resolveSystemTheme);

  const theme = resolveThemeMode(preference, systemTheme);
  const tokens = useMemo(() => getThemeDefinition(theme), [theme]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'dark' : 'light');
    };

    setSystemTheme(mediaQuery.matches ? 'dark' : 'light');
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  useSafeLayoutEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (preference === 'system') {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  }, [preference]);

  const contextValue = useMemo(
    () => ({
      theme,
      preference,
      setTheme: setPreference,
      toggleTheme: () => {
        setPreference((currentPreference) => {
          const currentTheme = resolveThemeMode(currentPreference, systemTheme);
          return currentTheme === 'dark' ? 'light' : 'dark';
        });
      },
      isDark: theme === 'dark',
      tokens,
    }),
    [theme, preference, systemTheme, tokens],
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      <ConfigProvider theme={tokens.ant}>
        <AntdApp>{children}</AntdApp>
      </ConfigProvider>
    </ThemeContext.Provider>
  );
};
