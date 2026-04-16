import { THEME_STORAGE_KEY } from './tokens';

const resolveInitialTheme = (): 'light' | 'dark' => {
  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === 'light' || storedTheme === 'dark') {
      return storedTheme;
    }
  } catch {
    // Ignore storage access issues and fall back to system theme.
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const bootstrapTheme = (): void => {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return;
  }

  const theme = resolveInitialTheme();
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
};
