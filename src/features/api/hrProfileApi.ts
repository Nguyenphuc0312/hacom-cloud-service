/**
 * HR Profile API — fetches the current user's authoritative HR profile from
 * hr-api-service (`GET /auth/me`). HRM is the source of truth for employment
 * fields (chức vụ / phòng ban / trạng thái / ngày vào làm), which the chat
 * profile copy (`/users/profile`) does NOT carry. The chat profile stays the
 * source for avatar/bio; HR fields below override the stale/empty chat copy.
 *
 * Uses the same auth token as attendance/calendar via `hrApiClient`. The
 * `/auth/me` route requires only a valid Bearer token (no HR permission).
 */

import { hrApiClient } from "./hrApi";

/** Nested org reference returned inside the employee object. */
export interface HrOrgRef {
  id: string;
  code: string;
  name: string;
}

/** Employee shape from hr-api-service UserContext.employee. */
export interface HrEmployee {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string | null;
  companyEmail: string | null;
  personalEmail: string | null;
  phone: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  dateOfJoining: string | null;
  citizenIdMasked: string | null;
  status: string;
  employmentStatus: string;
  unitId: string | null;
  departmentId: string | null;
  positionId: string | null;
  businessSector: (HrOrgRef & { /* same shape */ }) | null;
  unit: (HrOrgRef & { shortName: string | null; taxCode: string | null }) | null;
  department: HrOrgRef | null;
  position: HrOrgRef | null;
}

/** Subset of hr-api-service `/auth/me` we consume on the FE. */
export interface HrMeProfile {
  userId: string;
  authUserId: string;
  email: string;
  username: string | null;
  fullName: string;
  accountStatus: string;
  employeeId: string | null;
  employee: HrEmployee | null;
}

/**
 * Fetch the current user's HR profile.
 * Returns `null` when the caller has no linked HR employee (graceful: chat-only
 * accounts), or on any HR error — HRM is optional and must never break the
 * profile screen. Callers fall back to the chat-api profile copy.
 */
export const getMyHrProfile = async (
  options?: { signal?: AbortSignal },
): Promise<HrMeProfile | null> => {
  const response = await hrApiClient.get("/auth/me", { signal: options?.signal });
  const body = response.data as
    | { success?: boolean; data?: HrMeProfile }
    | HrMeProfile;

  const payload =
    body && typeof body === "object" && "success" in body
      ? (body as { success?: boolean; data?: HrMeProfile }).data ?? null
      : (body as HrMeProfile);

  return payload ?? null;
};

export const hrProfileApi = { getMyHrProfile };

export default hrProfileApi;
