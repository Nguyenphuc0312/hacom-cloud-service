import { MessageType } from "../types";
import type { Message } from "../types";

export const LONG_MESSAGE_COLLAPSE_CHAR_THRESHOLD = 4_000;
export const LONG_MESSAGE_COLLAPSE_ESTIMATED_LINE_THRESHOLD = 24;
export const LONG_MESSAGE_COLLAPSE_PREVIEW_CHAR_LIMIT = 1_600;
export const DEFAULT_TEXT_CHARS_PER_LINE = 42;

const INLINE_URL_REGEX = /https?:\/\/[^\s]+/i;

export type LongMessageRenderMode = "collapsed" | "expanded";
export type TimelineMeasurementMode = "static" | "dynamic";

export const hasInlineUrl = (content?: string): boolean =>
  typeof content === "string" && INLINE_URL_REGEX.test(content);

export const estimateTextLineCount = (
  content: string | undefined,
  charsPerLine = DEFAULT_TEXT_CHARS_PER_LINE,
): number => {
  if (!content) {
    return 1;
  }

  const safeCharsPerLine = Math.max(8, Math.floor(charsPerLine));
  const lines = content.split(/\r?\n/);

  return lines.reduce((total, rawLine) => {
    if (rawLine.length === 0) {
      return total + 1;
    }

    let currentLineWidth = 0;
    let lineCount = 1;
    const segments = rawLine.split(/(\s+)/);

    segments.forEach((segment) => {
      if (!segment) {
        return;
      }

      let remaining = segment.length;
      while (remaining > 0) {
        const availableWidth = safeCharsPerLine - currentLineWidth;
        if (availableWidth <= 0) {
          lineCount += 1;
          currentLineWidth = 0;
          continue;
        }

        if (remaining <= availableWidth) {
          currentLineWidth += remaining;
          remaining = 0;
          continue;
        }

        remaining -= availableWidth;
        lineCount += 1;
        currentLineWidth = 0;
      }
    });

    return total + lineCount;
  }, 0);
};

export const isLongMessageContent = (content: string | undefined): boolean =>
  (content?.length ?? 0) > LONG_MESSAGE_COLLAPSE_CHAR_THRESHOLD ||
  estimateTextLineCount(content) > LONG_MESSAGE_COLLAPSE_ESTIMATED_LINE_THRESHOLD;

export const isPlainStaticTextMessage = (message: Message): boolean =>
  message.type === MessageType.TEXT &&
  !message.replyToMessage &&
  !message.forwardedFrom &&
  (message.reactions?.length ?? 0) === 0 &&
  (message.attachments?.length ?? 0) === 0 &&
  !hasInlineUrl(message.content);

export const isCollapsiblePlainTextMessage = (message: Message): boolean =>
  isPlainStaticTextMessage(message) && isLongMessageContent(message.content);

export const getCollapsedTextPreview = (
  content: string,
  maxChars = LONG_MESSAGE_COLLAPSE_PREVIEW_CHAR_LIMIT,
): string => {
  if (content.length <= maxChars) {
    return content;
  }

  const preview = content.slice(0, maxChars).trimEnd();
  return `${preview}\u2026`;
};
