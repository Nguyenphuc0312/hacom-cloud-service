import { getAccessToken } from "../../../services/tokenService";
import { getTokenIdentity } from "../../../services/authIdentityGuard";

const normalizedId = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;

/**
 * Resolve the Cloud owner from authenticated client state.
 *
 * Older persisted sessions can have a valid access token before the user
 * profile has been rehydrated. The token subject is a safe UI fallback; the
 * Cloud API still validates the signed token and remains the authority.
 */
export const resolveCloudUserId = (
  authUserId: unknown,
  accessToken: string | null | undefined = getAccessToken(),
): string | undefined =>
  normalizedId(authUserId) ??
  normalizedId(getTokenIdentity(accessToken)?.authUserId);
