/**
 * Đọc LÝ DO THẬT từ response lỗi của các endpoint nộp file báo cáo công việc
 * (`#congviectuan` → `/api/chat/personal/weekly-report/upload`, `#TBP_baocao` /
 * `#LDDV_baocao` → `/api/level-reports/upload`).
 *
 * Contract FE 07/08/26 §2: FE từng nuốt body lỗi và hiện chung một câu "Đã xảy
 * ra lỗi hệ thống", nên user nộp sai form / sai tuần / nộp thay người khác đều
 * thấy y hệt nhau và không biết phải sửa gì. BE đã trả lý do cụ thể trong body —
 * chỉ cần đọc.
 *
 * Thứ tự ưu tiên (§2): `detail.message` → `detail` (chuỗi) → `message` → `error`
 * → fallback theo HTTP status. `detail` có thể là OBJECT (luồng báo cáo cấp) nên
 * không được `String(detail)` — sẽ ra "[object Object]".
 *
 * Chỉ dùng câu "mất kết nối" khi trình duyệt KHÔNG nhận được response
 * (`xhr.onerror` / `fetch` throw), không dùng cho mọi HTTP lỗi.
 */

export interface UploadFailure {
  status: number;
  message: string;
  reason?: string;
  action?: string;
  scopes?: unknown[];
  retryAfterSeconds?: number;
}

function trimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Fallback khi body rỗng/không phải JSON — §3 của contract. */
export function fallbackUploadMessage(status: number): string {
  if (status === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  if (status === 403) return "Bạn không có quyền nộp báo cáo này.";
  if (status === 409) return "Dữ liệu đã thay đổi. Vui lòng xuất file mới rồi thử lại.";
  if (status === 413) return "File quá lớn. Vui lòng chọn file nhỏ hơn.";
  if (status === 415) return "Định dạng tệp không được hỗ trợ. Chỉ nhận file Excel .xlsx.";
  if (status === 422)
    return "Thông tin nộp file chưa hợp lệ. Vui lòng chọn lại file và kỳ báo cáo.";
  if (status === 429) return "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.";
  if (status >= 500)
    return "Chưa thể nộp báo cáo lúc này. Báo cáo chưa được ghi nhận; vui lòng thử lại sau.";
  return "Không thể nộp báo cáo. Vui lòng kiểm tra file và thử lại.";
}

/** Câu duy nhất dùng khi KHÔNG có HTTP response (mất mạng/timeout/huỷ) — §4. */
export const UPLOAD_CONNECTION_ERROR =
  "Không thể kết nối tới hệ thống báo cáo. Báo cáo chưa được ghi nhận; vui lòng kiểm tra mạng và thử lại.";

/**
 * Bóc lỗi từ BODY THÔ (dùng chung cho `XMLHttpRequest.responseText` và
 * `Response.text()`). `retryAfterHeader` chỉ có ở nhánh fetch/XHR đọc được header.
 */
export function readUploadFailureFromBody(
  status: number,
  rawBody: string,
  retryAfterHeader?: string | null,
): UploadFailure {
  let body: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
  } catch {
    // Không phải JSON: có thể là text thuần BE/proxy trả (vd HTML 502). Text
    // thuần ngắn thì vẫn là lý do đọc được; dài/HTML thì fallback theo status.
  }

  const detail = body.detail;
  const detailObject =
    detail && typeof detail === "object" && !Array.isArray(detail)
      ? (detail as Record<string, unknown>)
      : undefined;

  const plainText = !Object.keys(body).length ? trimmedString(rawBody) : undefined;

  const message =
    trimmedString(detailObject?.message) ??
    trimmedString(detail) ??
    trimmedString(body.message) ??
    trimmedString(body.error) ??
    // Text thuần chỉ nhận khi ngắn và không phải HTML — tránh đổ cả trang lỗi
    // của proxy vào bong bóng chat.
    (plainText && plainText.length <= 300 && !plainText.startsWith("<")
      ? plainText
      : undefined) ??
    fallbackUploadMessage(status);

  const retryAfter = Number(retryAfterHeader);

  return {
    status,
    message,
    reason: trimmedString(detailObject?.reason),
    action: trimmedString(detailObject?.action),
    scopes: Array.isArray(detailObject?.scopes) ? detailObject.scopes : undefined,
    retryAfterSeconds:
      retryAfterHeader != null && Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter
        : undefined,
  };
}

/** Bản `Response` (fetch) của hàm trên — clone để caller vẫn đọc lại được body. */
export async function readWorkReportUploadFailure(
  response: Response,
): Promise<UploadFailure> {
  const rawBody = await response
    .clone()
    .text()
    .catch(() => "");
  return readUploadFailureFromBody(
    response.status,
    rawBody,
    response.headers.get("Retry-After"),
  );
}

/**
 * Ghép thời gian chờ vào câu 429 khi BE có gửi `Retry-After` (§4). BE thường
 * không nhắc số giây trong `detail`, mà đó chính là thứ user cần biết.
 */
export function withRetryAfterHint(failure: UploadFailure): string {
  if (failure.status !== 429 || !failure.retryAfterSeconds) return failure.message;
  const seconds = Math.ceil(failure.retryAfterSeconds);
  const wait =
    seconds >= 60 ? `${Math.ceil(seconds / 60)} phút` : `${seconds} giây`;
  return `${failure.message} (thử lại sau ${wait})`;
}
