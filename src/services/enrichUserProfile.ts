import { loadUserProfile } from "./userBatchLoader";
import {
  looksLikeEmail,
  looksLikeIdentifier,
  resolveUserDisplayName,
} from "../features/chat/identity/resolveUserDisplayName";
import { useEnrichedProfileStore } from "../stores/enrichedProfileStore";

/**
 * A name is worth caching unless it is a machine value (employee code / system
 * username / email) that would be shown to users as if it were a name.
 *
 * This reuses the SAME heuristic as `resolveUserDisplayName` instead of keeping
 * a private, stricter copy. The old rule required a space or a non-ASCII
 * character, which rejected perfectly real one-word ASCII names — "Kevin",
 * "David", "Tom". Those users' names were never cached, so `@mention` tags in
 * older messages (and any surface falling back to the enriched name) kept
 * showing the pre-rename text forever, while the member list showed the new
 * name — the same "loạn tên" symptom, just from a different direction.
 */
const isRealName = (name: string): boolean =>
  !looksLikeEmail(name) && !looksLikeIdentifier(name);

/**
 * Resolves a user's display name via the coalescing batch loader (many enrich
 * calls in the same tick share one `POST /users/batch` request instead of one
 * `GET /users/{id}` each), then stores it in enrichedProfileStore unless the
 * resolved name is a machine identifier (employee code / email).
 */
export const enrichUserProfile = (userId: string): void => {
  if (!userId) return;

  // Already enriched — skip
  if (useEnrichedProfileStore.getState().nameByUserId[userId]) return;

  void loadUserProfile(userId)
    .then((profile) => {
      if (!profile) return;
      const name = resolveUserDisplayName(profile, { allowLegacyFallback: false });
      if (name && name !== "Unknown user" && isRealName(name)) {
        useEnrichedProfileStore.getState().setEnrichedName(userId, name);
      }
    })
    .catch(() => null);
};
