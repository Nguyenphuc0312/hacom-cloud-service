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
 * Resolves display name for a group member with proper fallback priority:
 * 1. fullName from HR profile
 * 2. displayName (self-set)
 * 3. Email local part (capitalized)
 * 4. Username
 */
export function resolveDisplayName(
  member: MemberData,
): ResolvedDisplayName {
  const { displayName, fullNameFromHR, username, email } = member;

  // Priority 1: fullName from HR
  if (fullNameFromHR?.trim()) {
    return { displayName: fullNameFromHR.trim(), usedFallback: false };
  }

  // Priority 2: displayName (skip if it looks like an email address)
  if (displayName?.trim() && !EMAIL_PATTERN.test(displayName.trim())) {
    return { displayName: displayName.trim(), usedFallback: false };
  }

  // Priority 3: email local part (capitalized)
  if (email) {
    const localPart = email.split("@")[0];
    if (localPart) {
      const capitalized = localPart.charAt(0).toUpperCase() + localPart.slice(1);
      return { displayName: capitalized, usedFallback: true };
    }
  }

  // Priority 4: username
  if (username?.trim()) {
    return { displayName: username.trim(), usedFallback: true };
  }

  // Ultimate fallback
  return { displayName: "Người dùng", usedFallback: true };
}
