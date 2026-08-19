// ponytail: session-kill/override bucket machinery removed; flag always true except in test
export const isChatRtkqMessagesRuntimeEnabled = (): boolean =>
  import.meta.env.MODE !== "test";

export const disableChatFlagForSession = (_key: string): void => {};
