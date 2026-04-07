export const COMMAND_PALETTE_OPEN_EVENT = "app:command-palette:open";
export const CHAT_OPEN_NEW_CHAT_EVENT = "chat:open-new-chat-modal";
export const OPEN_NEW_CHAT_INTENT_KEY = "chat.intent.open-new-chat";

const canUseBrowserApis = (): boolean =>
  typeof window !== "undefined" && typeof document !== "undefined";

export const emitCommandPaletteOpen = (): void => {
  if (!canUseBrowserApis()) {
    return;
  }
  window.dispatchEvent(new CustomEvent(COMMAND_PALETTE_OPEN_EVENT));
};

export const emitOpenNewChatModal = (): void => {
  if (!canUseBrowserApis()) {
    return;
  }
  window.dispatchEvent(new CustomEvent(CHAT_OPEN_NEW_CHAT_EVENT));
};

export const markOpenNewChatIntent = (): void => {
  if (!canUseBrowserApis()) {
    return;
  }
  window.sessionStorage.setItem(OPEN_NEW_CHAT_INTENT_KEY, "1");
};

export const consumeOpenNewChatIntent = (): boolean => {
  if (!canUseBrowserApis()) {
    return false;
  }

  const shouldOpen =
    window.sessionStorage.getItem(OPEN_NEW_CHAT_INTENT_KEY) === "1";
  if (shouldOpen) {
    window.sessionStorage.removeItem(OPEN_NEW_CHAT_INTENT_KEY);
  }

  return shouldOpen;
};
