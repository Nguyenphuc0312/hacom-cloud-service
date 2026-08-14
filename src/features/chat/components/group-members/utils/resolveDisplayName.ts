import { resolveUserDisplayName } from "../../../identity/resolveUserDisplayName";

interface MemberData {
  displayName?: string;
  fullNameFromHR?: string;
  username?: string;
  email?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ResolvedDisplayName {
  displayName: string;
  usedFallback: boolean;
}

/**
 * Resolves the display name for a group member.
 *
 * This delegates to the app-wide `resolveUserDisplayName` so the member list
 * agrees with the timeline, sidebar, mentions and profile panel. It previously
 * ranked `fullNameFromHR` ABOVE `displayName`, which inverted the shared rule:
 * a user who renamed themselves showed the new name everywhere in Chat but
 * their HR legal name here, which is exactly the "loạn giữa tên gốc và tên đã
 * đổi" report.
 *
 * `usedFallback` stays part of the contract — MemberRow styles the name
 * differently when it is a technical stand-in (email local part / username)
 * rather than a real human name.
 */
export function resolveDisplayName(
  member: MemberData,
): ResolvedDisplayName {
  const { displayName, fullNameFromHR, username, email } = member;

  const resolved = resolveUserDisplayName({
    displayName,
    fullNameFromHR,
    username,
  });

  const hasRealName =
    Boolean(displayName?.trim() && !EMAIL_PATTERN.test(displayName.trim())) ||
    Boolean(fullNameFromHR?.trim());

  if (resolved !== "Unknown user") {
    return { displayName: resolved, usedFallback: !hasRealName };
  }

  // No name-bearing field at all: fall back to the email local part before the
  // generic placeholder, matching the previous behaviour of this helper.
  if (email) {
    const localPart = email.split("@")[0];
    if (localPart) {
      const capitalized = localPart.charAt(0).toUpperCase() + localPart.slice(1);
      return { displayName: capitalized, usedFallback: true };
    }
  }

  if (username?.trim()) {
    return { displayName: username.trim(), usedFallback: true };
  }

  return { displayName: "Người dùng", usedFallback: true };
}
