import { fetchUserProfileOnce } from "./userProfileCache";
import { resolveUserDisplayName } from "../features/chat/identity/resolveUserDisplayName";
import { useEnrichedProfileStore } from "../stores/enrichedProfileStore";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A name is "real" (worth caching) if it contains a space or a non-ASCII
// character (e.g. Vietnamese diacritics). Employee codes (HC888892) and
// system usernames (manual000001) are pure ASCII with no spaces.
const isRealName = (name: string): boolean => {
  if (EMAIL_RE.test(name)) return false;
  if (name.includes(" ")) return true;
  for (let i = 0; i < name.length; i++) {
    if (name.charCodeAt(i) > 127) return true;
  }
  return false;
};

/**
 * Fetches /users/{id} once (TTL-cached), resolves the display name,
 * and stores it in enrichedProfileStore only when the resolved name
 * looks like a real human name (has a space or non-ASCII characters).
 */
export const enrichUserProfile = (userId: string): void => {
  if (!userId) return;

  // Already enriched — skip
  if (useEnrichedProfileStore.getState().nameByUserId[userId]) return;

  void fetchUserProfileOnce(userId)
    .then((profile) => {
      const name = resolveUserDisplayName(profile, { allowLegacyFallback: false });
      if (name && name !== "Unknown user" && isRealName(name)) {
        useEnrichedProfileStore.getState().setEnrichedName(userId, name);
      }
    })
    .catch(() => null);
};
