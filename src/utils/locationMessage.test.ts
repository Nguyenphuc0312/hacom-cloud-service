import { describe, expect, it, vi } from "vitest";
import {
  buildGoogleMapsSearchUrl,
  formatAccuracyMeters,
  getFriendlyAccuracyLabel,
  isValidLocationCoordinate,
  openLocationInMaps,
  sanitizeMapUrl,
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

// `mapUrl` nằm trong payload tin nhắn → người gửi kiểm soát được. Đây là hàng rào
// chặn open redirect dùng để phishing; sửa allowlist phải chạy lại bộ test này.
describe("sanitizeMapUrl — chặn open redirect từ mapUrl của người gửi", () => {
  it("chấp nhận host bản đồ đã duyệt qua https", () => {
    for (const url of [
      "https://www.google.com/maps/search/?api=1&query=21,105",
      "https://maps.google.com/?q=21,105",
      "https://maps.app.goo.gl/abc123",
    ]) {
      expect(sanitizeMapUrl(url)).toBe(url);
    }
  });

  it("từ chối host lạ (open redirect → phishing)", () => {
    expect(sanitizeMapUrl("https://evil.com/maps")).toBeNull();
  });

  it("từ chối host giả mạo kiểu tiền tố/hậu tố", () => {
    // Sẽ lọt nếu ai đó thay allowlist bằng endsWith/includes.
    expect(sanitizeMapUrl("https://evilgoogle.com/maps")).toBeNull();
    expect(sanitizeMapUrl("https://google.com.evil.com/maps")).toBeNull();
    expect(sanitizeMapUrl("https://evil.com/?x=google.com")).toBeNull();
  });

  it("từ chối scheme nguy hiểm và http", () => {
    expect(sanitizeMapUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeMapUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    // http: cho phép MITM đổi đích đến.
    expect(sanitizeMapUrl("http://www.google.com/maps")).toBeNull();
  });

  it("từ chối giá trị rỗng / không parse được", () => {
    expect(sanitizeMapUrl(undefined)).toBeNull();
    expect(sanitizeMapUrl(null)).toBeNull();
    expect(sanitizeMapUrl("")).toBeNull();
    expect(sanitizeMapUrl("not a url")).toBeNull();
  });
});

describe("openLocationInMaps — không mở mapUrl không tin cậy", () => {
  const location = { latitude: 21.027763, longitude: 105.83416 };
  const safeFallback =
    "https://www.google.com/maps/search/?api=1&query=21.027763%2C105.83416";

  it("rơi về URL tự dựng khi mapUrl trỏ tới host lạ", () => {
    const openSpy = vi
      .spyOn(window, "open")
      .mockReturnValue({ opener: null } as unknown as Window);

    openLocationInMaps({ ...location, mapUrl: "https://evil.com/phish" });

    expect(openSpy).toHaveBeenCalledWith(
      safeFallback,
      "_blank",
      "noopener,noreferrer",
    );
    openSpy.mockRestore();
  });

  it("dùng mapUrl khi nó thuộc host đã duyệt", () => {
    const trusted = "https://maps.app.goo.gl/abc123";
    const openSpy = vi
      .spyOn(window, "open")
      .mockReturnValue({ opener: null } as unknown as Window);

    openLocationInMaps({ ...location, mapUrl: trusted });

    expect(openSpy).toHaveBeenCalledWith(
      trusted,
      "_blank",
      "noopener,noreferrer",
    );
    openSpy.mockRestore();
  });
});
