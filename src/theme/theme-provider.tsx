import { App as AntdApp, ConfigProvider } from 'antd';
import { useEffect, useMemo } from 'react';
import type { PropsWithChildren } from 'react';

import { ThemeContext } from './theme-context';
import { getThemeDefinition } from './tokens';

export const ThemeProvider = ({ children }: PropsWithChildren) => {
  const tokens = useMemo(() => getThemeDefinition('light'), []);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    document.documentElement.dataset.theme = 'light';
    document.documentElement.style.colorScheme = 'light';
  }, []);

  const contextValue = useMemo(
    () => ({
      theme: 'light' as const,
      preference: 'light' as const,
      setTheme: () => undefined,
      toggleTheme: () => undefined,
      isDark: false,
      tokens,
    }),
    [tokens],
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      <ConfigProvider theme={tokens.ant}>
        <AntdApp>{children}</AntdApp>
      </ConfigProvider>
    </ThemeContext.Provider>
  );
};
