import type { LocationMessagePayload } from "../types";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const isValidLocationCoordinate = (
  location: Pick<LocationMessagePayload, "latitude" | "longitude">,
): boolean =>
  isFiniteNumber(location.latitude) &&
  isFiniteNumber(location.longitude) &&
  location.latitude >= -90 &&
  location.latitude <= 90 &&
  location.longitude >= -180 &&
  location.longitude <= 180;

export const buildGoogleMapsSearchUrl = (
  location: Pick<LocationMessagePayload, "latitude" | "longitude">,
): string => {
  if (!isValidLocationCoordinate(location)) {
    throw new Error("Invalid location coordinates");
  }

  const query = encodeURIComponent(`${location.latitude},${location.longitude}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
};

export const tryBuildGoogleMapsSearchUrl = (
  location: Pick<LocationMessagePayload, "latitude" | "longitude">,
): string | null => {
  if (!isValidLocationCoordinate(location)) return null;
  return buildGoogleMapsSearchUrl(location);
};

export const resolveAccuracyMeters = (
  location: Pick<LocationMessagePayload, "accuracyM" | "accuracy">,
): number | undefined =>
  typeof location.accuracyM === "number" ? location.accuracyM : location.accuracy;

export const formatAccuracyMeters = (accuracyM?: number): string | null => {
  if (typeof accuracyM !== "number" || !Number.isFinite(accuracyM) || accuracyM < 0) {
    return null;
  }

  return `${Math.round(accuracyM * 10) / 10} m`;
};

export const getFriendlyAccuracyLabel = (accuracyM?: number): {
  label: string | null;
  tone: "normal" | "warning";
} => {
  const formatted = formatAccuracyMeters(accuracyM);
  if (!formatted) {
    return { label: null, tone: "normal" };
  }
  if (typeof accuracyM === "number" && accuracyM <= 20) {
    return { label: `Chính xác khoảng ${formatted}`, tone: "normal" };
  }
  if (typeof accuracyM === "number" && accuracyM > 100) {
    return { label: "Vị trí có thể chưa chính xác", tone: "warning" };
  }
  return { label: `Chính xác khoảng ${formatted}`, tone: "normal" };
};

export const formatLocationTime = (capturedAt?: string): string | null => {
  if (!capturedAt) return null;
  const date = new Date(capturedAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const isLocationStale = (
  capturedAt?: string,
  thresholdMs = 3 * 60 * 1000,
): boolean => {
  if (!capturedAt) return false;
  const date = new Date(capturedAt);
  if (Number.isNaN(date.getTime())) return false;
  return Date.now() - date.getTime() > thresholdMs;
};

export const openLocationInMaps = (location: LocationMessagePayload): boolean => {
  if (typeof window === "undefined") return false;
  const url = location.mapUrl || tryBuildGoogleMapsSearchUrl(location);
  if (!url) return false;

  const next = window.open(url, "_blank", "noopener,noreferrer");
  if (next) {
    next.opener = null;
    return true;
  }
  return false;
};
