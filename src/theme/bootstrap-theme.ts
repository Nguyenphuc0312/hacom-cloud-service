export const bootstrapTheme = (): void => {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.dataset.theme = 'light';
  document.documentElement.style.colorScheme = 'light';
};
