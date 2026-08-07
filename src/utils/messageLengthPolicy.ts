import {
  LONG_MESSAGE_COLLAPSE_CHAR_THRESHOLD,
  LONG_MESSAGE_COLLAPSE_ESTIMATED_LINE_THRESHOLD,
  LONG_MESSAGE_PREVIEW_CHAR_LIMIT,
  MESSAGE_LENGTH_HARD_LIMIT,
  MESSAGE_LENGTH_SOFT_LIMIT,
  MESSAGE_LENGTH_SOFT_WARNING_RATIO,
} from "@hacom/chat-shared-types/chat";

export const MESSAGE_SOFT_LIMIT = MESSAGE_LENGTH_SOFT_LIMIT;
export const MESSAGE_HARD_LIMIT = MESSAGE_LENGTH_HARD_LIMIT;
export const MESSAGE_SOFT_WARNING_THRESHOLD = Math.ceil(
  MESSAGE_SOFT_LIMIT * MESSAGE_LENGTH_SOFT_WARNING_RATIO,
);
export const MESSAGE_COLLAPSE_CHAR_THRESHOLD =
  LONG_MESSAGE_COLLAPSE_CHAR_THRESHOLD;
export const MESSAGE_COLLAPSE_LINE_THRESHOLD =
  LONG_MESSAGE_COLLAPSE_ESTIMATED_LINE_THRESHOLD;
export const MESSAGE_PREVIEW_CHAR_LIMIT = LONG_MESSAGE_PREVIEW_CHAR_LIMIT;
export const MESSAGE_LINKIFY_MAX_CHARS = 6_000;
export const MESSAGE_SEARCH_PREVIEW_MAX_CHARS = 240;
export const MESSAGE_SEARCH_PREVIEW_CONTEXT_CHARS = 96;

export interface InlineMessageValidationState {
  charCount: number;
  softLimit: number;
  hardLimit: number;
  isNearSoftLimit: boolean;
  isOverSoftLimit: boolean;
  isOverHardLimit: boolean;
  showCounter: boolean;
  canSendInlineMessage: boolean;
}

export const getInlineMessageValidationState = (
  content: string,
): InlineMessageValidationState => {
  const charCount = content.length;
  const isOverHardLimit = charCount > MESSAGE_HARD_LIMIT;
  const isOverSoftLimit = charCount > MESSAGE_SOFT_LIMIT;
  const isNearSoftLimit = charCount >= MESSAGE_SOFT_WARNING_THRESHOLD;

  return {
    charCount,
    softLimit: MESSAGE_SOFT_LIMIT,
    hardLimit: MESSAGE_HARD_LIMIT,
    isNearSoftLimit,
    isOverSoftLimit,
    isOverHardLimit,
    showCounter: isNearSoftLimit || isOverHardLimit,
    canSendInlineMessage: !isOverHardLimit,
  };
};

const formatDatePart = (value: number): string => value.toString().padStart(2, "0");

export const buildLongMessageTextFileName = (date: Date = new Date()): string =>
  [
    "message-",
    date.getFullYear(),
    formatDatePart(date.getMonth() + 1),
    formatDatePart(date.getDate()),
    "-",
    formatDatePart(date.getHours()),
    formatDatePart(date.getMinutes()),
    ".txt",
  ].join("");

export const createLongMessageTextFile = (
  content: string,
  date: Date = new Date(),
): File =>
  new File([content], buildLongMessageTextFileName(date), {
    type: "text/plain;charset=utf-8",
  });

const clampRange = (
  start: number,
  end: number,
  maxLength: number,
): { start: number; end: number } => {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.min(maxLength, Math.max(safeStart, end));
  return {
    start: safeStart,
    end: safeEnd,
  };
};

/**
 * Nội dung tin nhắn được soạn bằng Tiptap nên có thể là HTML (`<p>`, `<a href…>`).
 * Bản xem trước là văn bản thuần, hiện thẳng HTML sẽ ra `<p><a target="_blank"…`
 * thay vì câu chữ người dùng gõ.
 */
const toPlainText = (content: string): string => {
  if (!/<[a-z][\s\S]*>/i.test(content)) return content;
  const text = new DOMParser().parseFromString(content, "text/html").body.textContent ?? "";
  return text.replace(/\s+/g, " ").trim();
};

export const getMessageSearchPreview = (
  rawContent: string,
  query: string,
): string => {
  const content = toPlainText(rawContent ?? "");
  if (!content) {
    return "";
  }

  if (content.length <= MESSAGE_SEARCH_PREVIEW_MAX_CHARS) {
    return content;
  }

  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return `${content.slice(0, MESSAGE_SEARCH_PREVIEW_MAX_CHARS).trimEnd()}...`;
  }

  const matchIndex = content.toLowerCase().indexOf(normalizedQuery);
  if (matchIndex < 0) {
    return `${content.slice(0, MESSAGE_SEARCH_PREVIEW_MAX_CHARS).trimEnd()}...`;
  }

  const previewStart = matchIndex - MESSAGE_SEARCH_PREVIEW_CONTEXT_CHARS;
  const previewEnd =
    matchIndex + normalizedQuery.length + MESSAGE_SEARCH_PREVIEW_CONTEXT_CHARS;
  const { start, end } = clampRange(previewStart, previewEnd, content.length);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < content.length ? "..." : "";

  return `${prefix}${content.slice(start, end).trim()}${suffix}`;
};
