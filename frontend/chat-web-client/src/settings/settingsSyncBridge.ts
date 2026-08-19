type SettingsConflictHandler = () => void | Promise<void>;

let settingsConflictHandler: SettingsConflictHandler | null = null;

export const registerSettingsConflictHandler = (
  handler: SettingsConflictHandler,
): (() => void) => {
  settingsConflictHandler = handler;

  return () => {
    if (settingsConflictHandler === handler) {
      settingsConflictHandler = null;
    }
  };
};

export const triggerSettingsConflictSync = async (): Promise<void> => {
  await settingsConflictHandler?.();
};
