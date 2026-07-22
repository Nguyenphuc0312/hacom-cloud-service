/**
 * useMyProfile — the single canonical resolver for the **current user's** own
 * profile fields. Settings → Hồ sơ cá nhân is the standard; every other
 * self-profile surface (the info-panel self view, edit dialogs, …) must read
 * the same resolved values from here instead of re-deriving them.
 *
 * Resolution rule: HRM (`useMyHrProfile`, fetched from hr-api-service and kept
 * fresh on focus/reconnect/poll) is the source of truth for employment fields
 * (chức vụ / phòng ban / công ty / mã NV / trạng thái / ngày vào làm). The
 * chat-api auth profile (`authStore.user`) is the fallback for chat-only
 * accounts and the source for avatar/bio/displayName.
 *
 * This hook returns **raw resolved values** (nullable, no i18n). Presentation —
 * empty-state labels, status label maps, date formatting — stays in the
 * consuming component so the data layer has no view concerns.
 */

import { useEffect, useMemo, useState } from "react";
import { useAuthStore, type User } from "../../stores";
import { userApi } from "../../services/api";
import { unwrapApiSuccess } from "../../lib/apiContract";
import { resolvePublicResourceUrl } from "../../config";
import { useMyHrProfile } from "../../hooks/useMyHrProfile";
import type { HrEmployee, HrMeProfile } from "../api/hrProfileApi";
import { resolveUserDisplayName } from "../chat/identity/resolveUserDisplayName";

/** First non-empty trimmed string value across the given keys. */
const readValue = (
  record: Record<string, unknown> | null | undefined,
  ...keys: string[]
): string | null => {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      const normalized = value.trim();
      if (normalized) return normalized;
    }
  }
  return null;
};

export interface MyProfile {
  /** Raw underlying sources, exposed for callers that need more than the fields. */
  user: User | null;
  hrProfile: HrMeProfile | null;
  employee: HrEmployee | null;
  loading: boolean;
  loaded: boolean;
  refetch: () => Promise<HrMeProfile | null>;

  // Resolved fields (HR over chat). Nullable where a value may be absent — the
  // consumer decides the empty-state presentation.
  /** Real human name; HR legal name wins over a code-like chat displayName. */
  displayName: string;
  /** HR legal name only, for callers feeding their own name resolution. */
  fullNameFromHr: string | null;
  /** Login username / account code (e.g. HC000975), distinct from displayName. */
  username: string | null;
  phone: string | null;
  corporateEmail: string | null;
  employeeCode: string | null;
  departmentName: string | null;
  /** Company / org unit (nhãn "Công ty"). */
  orgUnit: string | null;
  jobTitle: string | null;
  /** Raw HR employment-status code (PROBATION / ACTIVE / …); map to a label in the view. */
  employmentStatus: string | null;
  /** Raw ISO join date; format in the view. */
  dateOfJoining: string | null;
  avatar: string | undefined;
  bio: string | undefined;
  createdAt: string | undefined;
  /** Presence/account status from the auth profile, defaulting to "online". */
  status: string;
}

/**
 * @param options.enabled — when false, skips the HR fetch (e.g. when the profile
 *   panel is showing another user) and resolves from the auth profile alone.
 */
export const useMyProfile = (options?: { enabled?: boolean }): MyProfile => {
  const enabled = options?.enabled ?? true;
  const user = useAuthStore((state) => state.user);
  const { hrProfile, employee: hr, loading, loaded, refetch } = useMyHrProfile({
    enabled,
  });

  // Avatar comes from chat-api, never from the auth principal: `/auth/me`
  // carries only `avatarFileId`, and only chat-api owns file storage and can
  // sign a URL for it. The signature expires in ~15m, so it is fetched per
  // mount rather than persisted (authStore deliberately strips it).
  const [chatAvatar, setChatAvatar] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!enabled || !user?.id) {
      setChatAvatar(undefined);
      return;
    }
    let cancelled = false;
    void userApi
      .getProfile()
      .then((response) => {
        if (cancelled) return;
        const avatar = (unwrapApiSuccess(response) as { avatar?: string | null })
          ?.avatar;
        setChatAvatar(resolvePublicResourceUrl(avatar || undefined));
      })
      // ponytail: avatar is cosmetic — a failure falls back to the initials avatar
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [enabled, user?.id]);

  return useMemo<MyProfile>(() => {
    const record = (user as Record<string, unknown> | null) ?? null;
    const fullNameFromHr = hr?.fullName || hrProfile?.fullName || null;

    // HRM is authoritative for the legal name. Feed it into name resolution via
    // `fullNameFromHr` so a real HR name always wins over an empty or code-like
    // chat-api displayName.
    const displayName = resolveUserDisplayName(
      user ? { ...user, fullNameFromHr } : null,
      { allowLegacyFallback: true },
    );

    return {
      user,
      hrProfile,
      employee: hr,
      loading,
      loaded,
      refetch,

      displayName,
      fullNameFromHr,
      username:
        readValue(record, "username") ||
        hr?.employeeCode ||
        readValue(record, "employeeCode", "employee_code"),
      phone: hr?.phone || user?.phone || null,
      corporateEmail:
        hr?.companyEmail ||
        readValue(record, "corporateEmail", "emailFromHr", "email_from_hr") ||
        user?.email ||
        null,
      employeeCode:
        hr?.employeeCode ||
        readValue(record, "employeeCode", "employee_code"),
      departmentName:
        hr?.department?.name ||
        readValue(record, "departmentName", "department_name"),
      orgUnit: hr?.unit?.name || readValue(record, "orgUnit", "org_unit"),
      jobTitle:
        hr?.position?.name ||
        readValue(record, "jobTitle", "job_title", "title", "position"),
      employmentStatus: hr?.employmentStatus || null,
      dateOfJoining: hr?.dateOfJoining || null,
      avatar: chatAvatar ?? user?.avatar,
      bio: user?.bio,
      createdAt: user?.createdAt,
      status: user?.status || "online",
    };
  }, [user, hrProfile, hr, loading, loaded, refetch, chatAvatar]);
};

export default useMyProfile;
