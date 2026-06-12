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

// Matches employee codes / system usernames: no whitespace, purely alphanumeric
// (e.g. "HC888892", "manual000001"). Real human names contain spaces or
// characters outside [A-Za-z0-9_.-].
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_.@-]+$/;
const looksLikeIdentifier = (value: string): boolean =>
  IDENTIFIER_PATTERN.test(value) && !value.includes(" ");

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
    !looksLikeIdentifier(displayName);

  if (displayNameIsUsable) {
    return displayName;
  }

  if (fullNameFromHr) {
    return fullNameFromHr;
  }

  if (fullName) {
    return fullName;
  }

  // displayName that looks like an identifier is better than raw username
  if (displayName && !looksLikeEmail(displayName)) {
    return displayName;
  }

  if (username) {
    return username;
  }

  if (employeeCode) {
    return employeeCode;
  }

  if (options.allowLegacyFallback) {
    return asString(user.id) || "Unknown user";
  }

  return "Unknown user";
};
