/**
 * useMyHrProfile — exposes the current user's authoritative HR profile fetched
 * from hr-api-service (`/auth/me`). Module-level cache de-dupes concurrent
 * consumers (ProfileSettingsSection, UserProfile self-view) and lets a single
 * refetch fan out to every mounted hook.
 *
 * Freshness model — REST only (no WebSocket):
 *  - refetch on window focus and on network reconnect (returning to the tab
 *    reflects the latest HRM edits);
 *  - optional periodic polling while the tab is visible (`pollIntervalMs`), so
 *    an open profile view updates on its own without a manual reload.
 */

import { useCallback, useEffect, useState } from "react";
import {
  getMyHrProfile,
  type HrMeProfile,
} from "../features/api/hrProfileApi";
import { registerStoreResetter } from "../stores/storeResetRegistry";
import { logger } from "../utils/logger";

type State = {
  data: HrMeProfile | null;
  loading: boolean;
  loaded: boolean;
};

let cache: State = { data: null, loading: false, loaded: false };
let inflight: Promise<HrMeProfile | null> | null = null;
const subscribers = new Set<(state: State) => void>();

const emit = () => {
  for (const fn of subscribers) fn(cache);
};

const setState = (patch: Partial<State>) => {
  cache = { ...cache, ...patch };
  emit();
};

/**
 * Load the HR profile. Returns the cached value unless `force` is set.
 * Never throws — HRM is optional; failures keep the previous value.
 */
export const refreshMyHrProfile = async (
  force = false,
): Promise<HrMeProfile | null> => {
  if (!force && cache.loaded) return cache.data;
  if (inflight) return inflight;

  setState({ loading: true });
  inflight = getMyHrProfile()
    .then((data) => {
      setState({ data, loading: false, loaded: true });
      return data;
    })
    .catch((error) => {
      logger.warn("hr-profile", "fetch_failed", {
        message: (error as Error)?.message ?? "unknown",
      });
      setState({ loading: false, loaded: true });
      return cache.data;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
};

/** Drop the cache (e.g. on logout) so the next consumer refetches cleanly. */
export const resetMyHrProfileCache = () => {
  cache = { data: null, loading: false, loaded: false };
  inflight = null;
  emit();
};

// Clear HR profile on logout alongside the zustand stores.
registerStoreResetter("hrProfile", resetMyHrProfileCache);

export interface UseMyHrProfileResult {
  hrProfile: HrMeProfile | null;
  employee: HrMeProfile["employee"];
  loading: boolean;
  loaded: boolean;
  refetch: () => Promise<HrMeProfile | null>;
}

/** Default polling cadence while a profile view is open and the tab is visible. */
const DEFAULT_POLL_INTERVAL_MS = 60_000;

export const useMyHrProfile = (
  options?: { enabled?: boolean; pollIntervalMs?: number },
): UseMyHrProfileResult => {
  const enabled = options?.enabled ?? true;
  const pollIntervalMs = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const [state, setLocal] = useState<State>(cache);

  useEffect(() => {
    if (!enabled) return;

    subscribers.add(setLocal);
    // Local state initializes from `cache` via useState; the subscription keeps
    // it in sync from here on. Kick off a load (no-op if already loaded).
    void refreshMyHrProfile();

    const onFocus = () => void refreshMyHrProfile(true);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshMyHrProfile(true);
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    // Periodic REST polling — only while the tab is visible, to avoid burning
    // requests in a backgrounded tab.
    let intervalId: ReturnType<typeof setInterval> | undefined;
    if (pollIntervalMs > 0) {
      intervalId = setInterval(() => {
        if (document.visibilityState === "visible") {
          void refreshMyHrProfile(true);
        }
      }, pollIntervalMs);
    }

    return () => {
      subscribers.delete(setLocal);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      if (intervalId !== undefined) clearInterval(intervalId);
    };
  }, [enabled, pollIntervalMs]);

  const refetch = useCallback(() => refreshMyHrProfile(true), []);

  return {
    hrProfile: state.data,
    employee: state.data?.employee ?? null,
    loading: state.loading,
    loaded: state.loaded,
    refetch,
  };
};

export default useMyHrProfile;
