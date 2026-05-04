import type { TFunction } from "i18next";

const I18N_MARKER_PREFIX = "__I18N__";

const englishMessageMap: Array<[RegExp, string]> = [
  [/^login successful!?$/i, "Đăng nhập thành công."],
  [/^signed in with qr successfully\.?$/i, "Đăng nhập bằng QR thành công."],
  [/^login failed\.?$/i, "Đăng nhập thất bại."],
  [/^registration successful/i, "Đăng ký thành công."],
  [/^registration failed\.?$/i, "Đăng ký thất bại."],
  [/^password reset email has been sent!?$/i, "Email đặt lại mật khẩu đã được gửi."],
  [/^invalid email/i, "Email không hợp lệ."],
  [/^invalid password/i, "Mật khẩu không hợp lệ."],
  [/^invalid credentials\.?$/i, "Tài khoản hoặc mật khẩu không đúng."],
  [/^unauthorized\.?$/i, "Bạn chưa đăng nhập hoặc phiên đã hết hạn."],
  [/^forbidden\.?$/i, "Bạn không có quyền thực hiện thao tác này."],
  [/^network error\.?$/i, "Không thể kết nối máy chủ. Vui lòng thử lại."],
  [/^request failed\.?$/i, "Yêu cầu thất bại. Vui lòng thử lại."],
];

const asText = (value: unknown): string =>
  typeof value === "string" ? value : "";

export const translateI18nMessage = (
  message: string | undefined,
  t: TFunction,
): string => {
  if (!message) {
    return "";
  }

  if (!message.startsWith(I18N_MARKER_PREFIX)) {
    return message;
  }

  const marker = message.slice(I18N_MARKER_PREFIX.length);
  const [key, rawParams = "{}"] = marker.split("::");

  try {
    return asText(t(key, JSON.parse(rawParams)));
  } catch {
    return asText(t(key));
  }
};

export const toVietnameseMessage = (
  message: string | undefined,
  fallback: string,
): string => {
  const normalized = message?.trim();
  if (!normalized) {
    return fallback;
  }

  const translated = englishMessageMap.find(([pattern]) =>
    pattern.test(normalized),
  )?.[1];

  return translated || normalized;
};
