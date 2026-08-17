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

/**
 * Host bản đồ được phép mở từ `mapUrl` của tin nhắn.
 *
 * `mapUrl` nằm trong payload tin nhắn nên NGƯỜI GỬI kiểm soát được: nếu mở thẳng,
 * kẻ gửi đặt `mapUrl` thành `https://evil.com` và nạn nhân bấm "xem trên bản đồ"
 * trong khi tưởng mình đi Google Maps — open redirect dùng được để phishing.
 *
 * Chặn theo scheme là chưa đủ (`https://evil.com` vẫn hợp lệ), nên phải chặn theo
 * host. Toạ độ đã được kiểm tra cục bộ và tự dựng được URL an toàn qua
 * `buildGoogleMapsSearchUrl`, nên `mapUrl` lạ không mang thêm giá trị gì → bỏ.
 */
const ALLOWED_MAP_HOSTS = new Set([
  "google.com",
  "www.google.com",
  "maps.google.com",
  "goo.gl",
  "maps.app.goo.gl",
]);

/**
 * Trả về `mapUrl` nếu nó thật sự trỏ tới một host bản đồ đã duyệt, ngược lại `null`.
 *
 * Chỉ chấp nhận https: — http: cho phép man-in-the-middle đổi đích đến.
 * So khớp host chính xác (không dùng `endsWith`) vì `evilgoogle.com` và
 * `google.com.evil.com` đều lọt nếu so kiểu hậu tố.
 */
export const sanitizeMapUrl = (
  mapUrl: string | undefined | null,
): string | null => {
  if (!mapUrl) return null;
  try {
    const parsed = new URL(mapUrl);
    if (parsed.protocol !== "https:") return null;
    return ALLOWED_MAP_HOSTS.has(parsed.hostname.toLowerCase()) ? mapUrl : null;
  } catch {
    return null; // Không parse được → không tin.
  }
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
  // mapUrl do người gửi kiểm soát → phải lọc qua allowlist host trước khi mở.
  // Không hợp lệ thì rơi về URL tự dựng từ toạ độ (đã validate cục bộ), chứ
  // KHÔNG mở đại URL lạ.
  const url =
    sanitizeMapUrl(location.mapUrl) || tryBuildGoogleMapsSearchUrl(location);
  if (!url) return false;

  const next = window.open(url, "_blank", "noopener,noreferrer");
  if (next) {
    next.opener = null;
    return true;
  }
  return false;
};
