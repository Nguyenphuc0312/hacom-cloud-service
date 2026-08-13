export interface UserIdentityCandidate {
  id?: string | null;
  username?: string | null;
  displayName?: string | null;
  display_name?: string | null;
  fullName?: string | null;
  full_name?: string | null;
  fullNameFromHR?: string | null;
  fullNameFromHr?: string | null;
  full_name_from_hr?: string | null;
  fullNameHR?: string | null;
  hrLegalName?: string | null;
  employeeCode?: string | null;
  employee_code?: string | null;
  code?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
}

export interface ResolveUserDisplayNameOptions {
  allowLegacyFallback?: boolean;
  /**
   * Trust `displayName` even when it looks like a system identifier.
   *
   * The identifier heuristic exists to hide inherited machine values (employee
   * code "HC888892" projected into displayName). That reasoning does not hold
   * for the signed-in user's own profile: a name they just typed and saved is
   * an intentional choice, so discarding it makes the edit look like it silently
   * failed — the name simply snaps back to the HR legal name.
   *
   * Only set this where the value is known to be self-authored.
   */
  trustDisplayName?: boolean;
}

const asString = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
};

const joinName = (parts: Array<string | null | undefined>): string =>
  parts
    .map((part) => asString(part))
    .filter(Boolean)
    .join(" ");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const looksLikeEmail = (value: string): boolean => EMAIL_PATTERN.test(value);

// Matches employee codes / system usernames: no whitespace, purely alphanumeric,
// AND containing at least one digit (e.g. "HC888892", "manual000001"). The digit
// requirement is what distinguishes a system identifier from a single-word human
// name like "David"/"Lisa" — those are plain letters and must NOT be discarded.
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_.@-]+$/;
const looksLikeIdentifier = (value: string): boolean =>
  IDENTIFIER_PATTERN.test(value) && !value.includes(" ") && /\d/.test(value);

// Matches a canonical UUID (e.g. senderId "d530b738-ca1d-42d0-b8e5-a07112a529c3").
// A UUID is never a meaningful display name, so it must never be shown to users.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const looksLikeUuid = (value: string): boolean => UUID_PATTERN.test(value);

export const resolveUserDisplayName = (
  user: UserIdentityCandidate | null | undefined,
  options: ResolveUserDisplayNameOptions = {},
): string => {
  if (!user) {
    return "Unknown user";
  }

  const displayName = asString(user.displayName) || asString(user.display_name);
  const fullNameFromHr =
    asString(user.fullNameFromHR) ||
    asString(user.fullNameFromHr) ||
    asString(user.full_name_from_hr) ||
    asString(user.fullNameHR) ||
    asString(user.hrLegalName);
  const fullName =
    asString(user.fullName) ||
    asString(user.full_name) ||
    joinName([user.firstName, user.lastName]);
  const username = asString(user.username) || asString(user.name);
  const employeeCode =
    asString(user.employeeCode) ||
    asString(user.employee_code) ||
    asString(user.code);

  // Skip displayName if it looks like an email or a system identifier
  // (employee code / username used as display name). Prefer real name data instead.
  const displayNameIsUsable =
    displayName &&
    !looksLikeEmail(displayName) &&
    !looksLikeUuid(displayName) &&
    (options.trustDisplayName || !looksLikeIdentifier(displayName));

  if (displayNameIsUsable) {
    return displayName;
  }

  if (fullNameFromHr) {
    return fullNameFromHr;
  }

  if (fullName) {
    return fullName;
  }

  if (username && !looksLikeUuid(username)) {
    return username;
  }

  // Last resort: return displayName even if it looks like an identifier,
  // but never show a UUID or email as a display name.
  if (displayName && !looksLikeEmail(displayName) && !looksLikeUuid(displayName)) {
    return displayName;
  }

  if (employeeCode && !looksLikeUuid(employeeCode)) {
    return employeeCode;
  }

  if (options.allowLegacyFallback) {
    const id = asString(user.id);
    if (id && !looksLikeUuid(id)) {
      return id;
    }
  }

  return "Unknown user";
};
