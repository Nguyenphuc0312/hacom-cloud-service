export interface UserIdentityCandidate {
  id?: string | null;
  username?: string | null;
  displayName?: string | null;
  display_name?: string | null;
  fullName?: string | null;
  full_name?: string | null;
  fullNameFromHR?: string | null;
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

  if (displayName) {
    return displayName;
  }

  if (fullNameFromHr) {
    return fullNameFromHr;
  }

  if (fullName) {
    return fullName;
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
