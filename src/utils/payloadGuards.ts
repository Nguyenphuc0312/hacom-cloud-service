/**
 * Type guard cho payload thô (REST / WebSocket).
 *
 * Gom về một chỗ vì `asRecord` từng được chép nguyên ở 4 file khác nhau. Hai
 * biến thể `asString` / `asStringValue` KHÔNG gộp làm một: chúng khác kiểu trả
 * về (`null` vs `undefined`) và nơi gọi phụ thuộc vào đúng kiểu đó — gộp lại sẽ
 * làm hỏng các chuỗi `??` đang dùng.
 */

/** Object bất kỳ (kể cả mảng) → Record; còn lại → null. */
export const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;

/** Chuỗi không rỗng → chính nó; còn lại → `null`. */
export const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

/** Như `asString` nhưng trả `undefined` — hợp với chuỗi `??` khi dựng object. */
export const asStringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

/** Số hữu hạn → chính nó; NaN / Infinity / kiểu khác → `undefined`. */
export const asNumberValue = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;
