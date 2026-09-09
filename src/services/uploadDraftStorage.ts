import type { PersistedAttachmentDraft } from "../types/attachmentDraft";

const STORAGE_PREFIX = "uploadDraft:";
const VERSIONED_STORAGE_PREFIX = `${STORAGE_PREFIX}v2:`;

const canUseSessionStorage = (): boolean =>
  typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";

const normalizeScopePart = (value: string | undefined): string | null => {
  const normalized = value?.trim();
  return normalized ? encodeURIComponent(normalized) : null;
};

const getStorage = (): Storage | null => {
  if (!canUseSessionStorage()) return null;

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

export const getUploadDraftStorageKey = (
  accountId: string | undefined,
  conversationId: string | undefined,
): string | null => {
  const accountScope = normalizeScopePart(accountId);
  const conversationScope = normalizeScopePart(conversationId);
  if (!accountScope || !conversationScope) return null;

  return `${VERSIONED_STORAGE_PREFIX}${accountScope}:${conversationScope}`;
};

export const readPersistedUploadDrafts = (
  accountId: string | undefined,
  conversationId: string | undefined,
): PersistedAttachmentDraft[] => {
  const storage = getStorage();
  const key = getUploadDraftStorageKey(accountId, conversationId);
  if (!storage || !key) return [];

  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is PersistedAttachmentDraft =>
            Boolean(item) && typeof item === "object",
        )
      : [];
  } catch {
    return [];
  }
};

export const persistUploadDrafts = (
  accountId: string | undefined,
  conversationId: string | undefined,
  drafts: PersistedAttachmentDraft[],
): void => {
  const storage = getStorage();
  const key = getUploadDraftStorageKey(accountId, conversationId);
  if (!storage || !key) return;

  try {
    if (drafts.length === 0) {
      storage.removeItem(key);
      return;
    }

    storage.setItem(key, JSON.stringify(drafts));
  } catch {
    // Storage quota/private-mode failures must not interrupt an upload.
  }
};

export const removePersistedUploadDrafts = (
  accountId: string | undefined,
  conversationId: string | undefined,
): void => {
  const storage = getStorage();
  const key = getUploadDraftStorageKey(accountId, conversationId);
  if (!storage || !key) return;

  try {
    storage.removeItem(key);
  } catch {
    // Ignore unavailable browser storage.
  }
};

const removeMatchingKeys = (predicate: (key: string) => boolean): void => {
  const storage = getStorage();
  if (!storage) return;

  try {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key && predicate(key)) {
        storage.removeItem(key);
      }
    }
  } catch {
    // Ignore unavailable browser storage.
  }
};

/** Legacy keys were not account scoped, so they must never be recovered. */
export const clearLegacyPersistedUploadDrafts = (): void => {
  removeMatchingKeys(
    (key) =>
      key.startsWith(STORAGE_PREFIX) &&
      !key.startsWith(VERSIONED_STORAGE_PREFIX),
  );
};

/** Clear one account's drafts, or every upload draft during logout/mismatch. */
export const clearPersistedUploadDrafts = (accountId?: string): void => {
  const accountScope = normalizeScopePart(accountId);
  const prefix = accountScope
    ? `${VERSIONED_STORAGE_PREFIX}${accountScope}:`
    : STORAGE_PREFIX;
  removeMatchingKeys((key) => key.startsWith(prefix));
};
