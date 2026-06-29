import { SHOW_USER_POSITION } from "../config/featureFlags";

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  value !== null && typeof value === "object";

const readTrimmedString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const readPositionValue = (user: UnknownRecord, key: string): string | null => {
  const value = user[key];
  const direct = readTrimmedString(value);
  if (direct) return direct;

  if (isRecord(value)) {
    return readTrimmedString(value.name);
  }

  return null;
};

export const shouldShowUserPosition = (): boolean => SHOW_USER_POSITION;

export const getSafeUserPosition = (user: unknown): string | null => {
  if (!shouldShowUserPosition() || !isRecord(user)) {
    return null;
  }

  for (const key of [
    "position",
    "jobTitle",
    "job_title",
    "employeeTitle",
    "designation",
  ]) {
    const value = readPositionValue(user, key);
    if (value) return value;
  }

  return null;
};

