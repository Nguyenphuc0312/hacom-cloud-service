type StoreResetter = () => void | Promise<void>;

const storeResetters = new Map<string, StoreResetter>();

export const registerStoreResetter = (
  key: string,
  resetter: StoreResetter,
): (() => void) => {
  storeResetters.set(key, resetter);

  return () => {
    const current = storeResetters.get(key);
    if (current === resetter) {
      storeResetters.delete(key);
    }
  };
};

export const runRegisteredStoreResets = async (): Promise<void> => {
  const resetters = Array.from(storeResetters.values());
  for (const resetter of resetters) {
    await resetter();
  }
};
