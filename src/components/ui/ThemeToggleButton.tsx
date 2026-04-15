import { useTheme } from '@/theme/theme-context';

export const ThemeToggleButton = () => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      className="ds-theme-toggle"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
      onClick={toggleTheme}
    >
      <span className="ds-theme-toggle-track" aria-hidden="true">
        <span className="ds-theme-toggle-icon ds-theme-toggle-icon-light">☀️</span>
        <span className="ds-theme-toggle-icon ds-theme-toggle-icon-dark">🌙</span>
        <span className="ds-theme-toggle-thumb" />
      </span>
      <span className="ds-theme-toggle-label">{isDark ? 'Dark' : 'Light'}</span>
    </button>
  );
};
