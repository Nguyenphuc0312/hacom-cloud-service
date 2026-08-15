import {
  invalidateUserProfileSummary,
  loadUserProfile,
} from "./userBatchLoader";
import {
  looksLikeEmail,
  looksLikeIdentifier,
  resolveUserDisplayName,
} from "../features/chat/identity/resolveUserDisplayName";
import { useEnrichedProfileStore } from "../stores/enrichedProfileStore";
import { useFriendshipStore } from "../stores/friendshipStore";

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
 * When each userId may next be re-enriched.
 *
 * The old guard was "already in `nameByUserId` ⇒ never enrich again", which made
 * a cached name permanent for the whole session: if someone renamed themselves
 * while you had the app open, their `@mention` tags and any enriched-name
 * surface kept the old name until a full reload.
 *
 * Dropping the guard entirely is not an option — `enrichUserProfile` is called
 * from a render effect for every mentioned user, so an unguarded call re-enters
 * on every re-render. This throttle keeps that cheap while still letting names
 * refresh: at most one attempt per user per window, and `loadUserProfile`
 * coalesces and TTL-caches underneath (5 min), so most attempts never reach the
 * network at all.
 */
const RE_ENRICH_INTERVAL_MS = 5 * 60 * 1000;
const nextEnrichAllowedAt = new Map<string, number>();

/** Test seam: forget throttle state so cases don't leak into each other. */
export const resetEnrichThrottle = (): void => {
  nextEnrichAllowedAt.clear();
};

/**
 * Resolves a user's display name via the coalescing batch loader (many enrich
 * calls in the same tick share one `POST /users/batch` request instead of one
 * `GET /users/{id}` each), then stores it in enrichedProfileStore unless the
 * resolved name is a machine identifier (employee code / email) or the viewer
 * has set an alias for that user.
 */
export const enrichUserProfile = (userId: string): void => {
  if (!userId) return;

  const now = Date.now();
  const allowedAt = nextEnrichAllowedAt.get(userId);
  if (allowedAt !== undefined && now < allowedAt) return;
  nextEnrichAllowedAt.set(userId, now + RE_ENRICH_INTERVAL_MS);

  runEnrich(userId);
};

/**
 * Re-fetch a profile even if the throttle/TTL would normally skip it, dropping
 * the cached avatar first.
 *
 * For one case only: the browser rejected a signed avatar URL (403). Avatar URLs
 * expire (`X-Amz-Expires=900`), and both the throttle here and the summary cache
 * in `loadUserProfile` would otherwise hand back the SAME dead URL for another
 * five minutes. Clearing both is what makes the retry fetch a fresh signature.
 */
export const refreshUserAvatar = (userId: string): void => {
  if (!userId) return;

  useEnrichedProfileStore.getState().clearEnrichedAvatar(userId);
  invalidateUserProfileSummary(userId);
  nextEnrichAllowedAt.delete(userId);
  nextEnrichAllowedAt.set(userId, Date.now() + RE_ENRICH_INTERVAL_MS);

  runEnrich(userId);
};

/** Shared fetch + store body for {@link enrichUserProfile}. */
const runEnrich = (userId: string): void => {

  void loadUserProfile(userId)
    .then((profile) => {
      if (!profile) return;

      // The avatar is cached before the alias check below: an alias renames a
      // person, it does not give them a different picture. Skipping this for
      // aliased friends is what left the "Người gửi" dropdown on initials for
      // exactly the people the viewer knows best.
      const avatarUrl = profile.avatarUrl?.trim();
      if (avatarUrl) {
        useEnrichedProfileStore.getState().setEnrichedAvatar(userId, avatarUrl);
      }

      // A "tên gợi nhớ" the viewer set themselves always outranks the real name
      // (Zalo rule). `friendshipStore` is the authoritative alias source;
      // `nameByUserId` is only a mirror it shares with this function. Re-enrich
      // can now run repeatedly, so without this check the second pass would
      // overwrite the alias with the real name.
      if (useFriendshipStore.getState().friendByUserId[userId]?.alias?.trim()) {
        return;
      }
      const name = resolveUserDisplayName(profile, { allowLegacyFallback: false });
      if (name && name !== "Unknown user" && isRealName(name)) {
        useEnrichedProfileStore.getState().setEnrichedName(userId, name);
      }
    })
    .catch(() => null);
};
