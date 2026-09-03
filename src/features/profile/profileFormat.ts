/**
 * Shared presentation helpers for profile employment fields. One definition used
 * by both Settings (`ProfileSettingsSection`) and the info panel (`UserProfile`)
 * so a status/date renders identically everywhere.
 */

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

/** Format an ISO date (e.g. "2026-04-15") as dd/MM/yyyy; null on bad input. */
export const formatJoinDate = (
  iso: string | null | undefined,
): string | null => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
};

/** HR employment-status codes returned by hr-api. */
export const EMPLOYMENT_STATUS_CODES = [
  "PROBATION",
  "ACTIVE",
  "SUSPENDED",
  "TERMINATED",
  "RESIGNED",
] as const;

/**
 * Map a raw HR employment-status code to its localized label. Unknown codes fall
 * back to the raw code; nullish input returns null (so callers can hide the row).
 */
export const resolveEmploymentStatusLabel = (
  code: string | null | undefined,
  t: TranslateFn,
): string | null => {
  if (!code) return null;
  const canonicalCode = code === "RESIGNED" ? "TERMINATED" : code;
  return t(`profile:settings.employmentStatusValues.${canonicalCode}`, {
    defaultValue: canonicalCode,
  });
};
