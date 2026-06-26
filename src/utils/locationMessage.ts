import type { LocationMessagePayload } from "../types";

export const buildGoogleMapsSearchUrl = (
  location: Pick<LocationMessagePayload, "latitude" | "longitude">,
): string => {
  const query = encodeURIComponent(`${location.latitude},${location.longitude}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
};

export const formatAccuracyMeters = (accuracyM?: number): string | null => {
  if (typeof accuracyM !== "number" || !Number.isFinite(accuracyM) || accuracyM < 0) {
    return null;
  }

  return `${Math.round(accuracyM * 10) / 10} m`;
};

export const openLocationInMaps = (location: LocationMessagePayload): void => {
  if (typeof window === "undefined") return;
  const next = window.open(buildGoogleMapsSearchUrl(location), "_blank", "noopener,noreferrer");
  if (next) {
    next.opener = null;
  }
};
