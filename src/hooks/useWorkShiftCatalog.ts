import { useCallback, useEffect, useState } from "react";
import { hrApi, type WorkShiftCatalogItem } from "../features/api/hrApi";
import { registerStoreResetter } from "../stores/storeResetRegistry";
import { logger } from "../utils/logger";

const POLL_INTERVAL_MS = 30_000;
const FALLBACK_SHIFT_CODES = [
  "HC",
  "HC-T7",
  "HC1",
  "HC2",
  "HC3",
  "HC4",
  "S1",
  "S2",
  "S3",
  "S4",
  "S5",
  "S6",
  "C1",
  "C2",
  "C3",
  "VH1",
  "VH2",
  "VH3",
  "BV1",
  "BV2",
  "BV3",
  "BV4",
  "BV5",
  "BV6",
] as const;

const SHIFT_FAMILY_ORDER = new Map([
  ["HC", 0],
  ["S", 1],
  ["C", 2],
  ["VH", 3],
  ["BV", 4],
]);

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface WorkShiftCodeMatcher {
  codes: ReadonlySet<string>;
  pattern: string | null;
}

export const createWorkShiftCodeMatcher = (
  codes: readonly string[],
): WorkShiftCodeMatcher => {
  const normalizedCodes = Array.from(
    new Set(codes.map((code) => code.trim().toUpperCase()).filter(Boolean)),
  ).sort(
    (left, right) => right.length - left.length || left.localeCompare(right),
  );

  return {
    codes: new Set(normalizedCodes),
    pattern:
      normalizedCodes.length > 0
        ? `(?:${normalizedCodes.map(escapeRegex).join("|")})`
        : null,
  };
};

export const FALLBACK_WORK_SHIFT_MATCHER =
  createWorkShiftCodeMatcher(FALLBACK_SHIFT_CODES);

interface WorkShiftCatalogState {
  items: WorkShiftCatalogItem[] | null;
  matcher: WorkShiftCodeMatcher;
  loading: boolean;
  loaded: boolean;
  error: boolean;
}

export interface UseWorkShiftCatalogResult extends WorkShiftCatalogState {
  refetch: () => Promise<WorkShiftCatalogItem[] | null>;
}

const initialState = (): WorkShiftCatalogState => ({
  items: null,
  matcher: FALLBACK_WORK_SHIFT_MATCHER,
  loading: false,
  loaded: false,
  error: false,
});

let state = initialState();
let fingerprint = "";
let requestGeneration = 0;
let inflight: Promise<WorkShiftCatalogItem[] | null> | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
const subscribers = new Set<(next: WorkShiftCatalogState) => void>();

const emit = () => {
  subscribers.forEach((subscriber) => subscriber(state));
};

const setState = (patch: Partial<WorkShiftCatalogState>) => {
  state = { ...state, ...patch };
  emit();
};

const compareShiftCodes = (
  left: WorkShiftCatalogItem,
  right: WorkShiftCatalogItem,
): number => {
  const leftFamily = left.code.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? "";
  const rightFamily = right.code.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? "";
  const familyDelta =
    (SHIFT_FAMILY_ORDER.get(leftFamily) ?? Number.MAX_SAFE_INTEGER) -
    (SHIFT_FAMILY_ORDER.get(rightFamily) ?? Number.MAX_SAFE_INTEGER);

  return (
    familyDelta ||
    left.code.localeCompare(right.code, undefined, {
      numeric: true,
      sensitivity: "base",
    })
  );
};

export const refreshWorkShiftCatalog = (
  force = false,
): Promise<WorkShiftCatalogItem[] | null> => {
  if (!force && state.loaded) return Promise.resolve(state.items);
  if (inflight) return inflight;

  if (!state.loaded) setState({ loading: true, error: false });
  const generation = requestGeneration;

  const request = hrApi
    .getWorkShiftCatalog()
    .then((items) => {
      if (generation !== requestGeneration) return state.items;

      const nextItems = [...items].sort(compareShiftCodes);
      const nextFingerprint = JSON.stringify(nextItems);
      if (state.loaded && nextFingerprint === fingerprint) {
        if (state.loading || state.error) {
          setState({ loading: false, error: false });
        }
        return state.items;
      }

      fingerprint = nextFingerprint;
      setState({
        items: nextItems,
        matcher: createWorkShiftCodeMatcher(
          nextItems.map((shift) => shift.code),
        ),
        loading: false,
        loaded: true,
        error: false,
      });
      return nextItems;
    })
    .catch((error: unknown) => {
      if (generation === requestGeneration) {
        logger.warn("work-shift-catalog", "fetch_failed", {
          message: error instanceof Error ? error.message : "unknown",
        });
        setState({ loading: false, error: true });
      }
      return state.items;
    });

  inflight = request;
  void request.then(() => {
    if (inflight === request) inflight = null;
  });
  return request;
};

const refreshWhenVisible = () => {
  if (document.visibilityState === "visible") {
    void refreshWorkShiftCatalog(true);
  }
};

const startSync = () => {
  void refreshWorkShiftCatalog();
  window.addEventListener("focus", refreshWhenVisible);
  window.addEventListener("online", refreshWhenVisible);
  document.addEventListener("visibilitychange", refreshWhenVisible);
  timer = setInterval(refreshWhenVisible, POLL_INTERVAL_MS);
};

const stopSync = () => {
  window.removeEventListener("focus", refreshWhenVisible);
  window.removeEventListener("online", refreshWhenVisible);
  document.removeEventListener("visibilitychange", refreshWhenVisible);
  if (timer) clearInterval(timer);
  timer = null;
};

export const resetWorkShiftCatalogCache = () => {
  requestGeneration += 1;
  inflight = null;
  fingerprint = "";
  state = initialState();
  emit();
};

registerStoreResetter("workShiftCatalog", resetWorkShiftCatalogCache);

export const useWorkShiftCatalog = (): UseWorkShiftCatalogResult => {
  const [localState, setLocalState] = useState(state);

  useEffect(() => {
    subscribers.add(setLocalState);
    if (subscribers.size === 1) startSync();

    return () => {
      subscribers.delete(setLocalState);
      if (subscribers.size === 0) stopSync();
    };
  }, []);

  const refetch = useCallback(() => refreshWorkShiftCatalog(true), []);

  return { ...localState, refetch };
};
