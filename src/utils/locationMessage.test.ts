import { describe, expect, it, vi } from "vitest";
import {
  buildGoogleMapsSearchUrl,
  formatAccuracyMeters,
  getFriendlyAccuracyLabel,
  isValidLocationCoordinate,
  openLocationInMaps,
  tryBuildGoogleMapsSearchUrl,
} from "./locationMessage";

describe("locationMessage utilities", () => {
  const location = {
    latitude: 21.027763,
    longitude: 105.83416,
    accuracyM: 18.44,
    capturedAt: "2026-06-26T02:30:00.000Z",
  };

  it("builds a Google Maps URL from coordinates without storing it on payload", () => {
    expect(buildGoogleMapsSearchUrl(location)).toBe(
      "https://www.google.com/maps/search/?api=1&query=21.027763%2C105.83416",
    );
    expect(location).not.toHaveProperty("mapUrl");
  });

  it("formats optional accuracy", () => {
    expect(formatAccuracyMeters(location.accuracyM)).toBe("18.4 m");
    expect(formatAccuracyMeters(undefined)).toBeNull();
    expect(formatAccuracyMeters(-1)).toBeNull();
    expect(getFriendlyAccuracyLabel(18.44)).toEqual({
      label: "Chính xác khoảng 18.4 m",
      tone: "normal",
    });
    expect(getFriendlyAccuracyLabel(180)).toEqual({
      label: "Vị trí có thể chưa chính xác",
      tone: "warning",
    });
  });

  it("rejects invalid coordinates before building a map URL", () => {
    expect(isValidLocationCoordinate(location)).toBe(true);
    const invalid = { latitude: 91, longitude: 105.83416 };
    expect(isValidLocationCoordinate(invalid)).toBe(false);
    expect(tryBuildGoogleMapsSearchUrl(invalid)).toBeNull();
    expect(() => buildGoogleMapsSearchUrl(invalid)).toThrow("Invalid location coordinates");
  });

  it("opens maps in a new noopener tab", () => {
    const opened = { opener: "existing" };
    const openSpy = vi
      .spyOn(window, "open")
      .mockReturnValue(opened as unknown as Window);

    expect(openLocationInMaps(location)).toBe(true);

    expect(openSpy).toHaveBeenCalledWith(
      "https://www.google.com/maps/search/?api=1&query=21.027763%2C105.83416",
      "_blank",
      "noopener,noreferrer",
    );
    expect(opened.opener).toBeNull();
  });
});
