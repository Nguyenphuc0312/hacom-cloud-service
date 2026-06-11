import { MessageType } from "../types";
import type { Message } from "../types";
import {
  MESSAGE_COLLAPSE_CHAR_THRESHOLD,
  MESSAGE_COLLAPSE_LINE_THRESHOLD,
} from "./messageLengthPolicy";

export const LONG_MESSAGE_COLLAPSE_CHAR_THRESHOLD =
  MESSAGE_COLLAPSE_CHAR_THRESHOLD;
export const LONG_MESSAGE_COLLAPSE_ESTIMATED_LINE_THRESHOLD =
  MESSAGE_COLLAPSE_LINE_THRESHOLD;
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
  (message.attachments?.length ?? 0) === 0;

export const isCollapsiblePlainTextMessage = (message: Message): boolean =>
  isPlainStaticTextMessage(message) && isLongMessageContent(message.content);

// These limits are intentionally shorter than the collapse trigger thresholds
// so that the collapsed preview is visibly different from the full message.
// (Collapse triggers at >1200 chars OR >20 lines; preview shows at most 600
// chars AND at most 8 lines, taking whichever truncation is shorter.)
const COLLAPSED_PREVIEW_CHAR_LIMIT = 600;
const COLLAPSED_PREVIEW_LINE_LIMIT = 8;

export const getCollapsedTextPreview = (content: string): string => {
  const lines = content.split(/\r?\n/);

  const byLine =
    lines.length > COLLAPSED_PREVIEW_LINE_LIMIT
      ? lines.slice(0, COLLAPSED_PREVIEW_LINE_LIMIT).join("\n").trimEnd()
      : null;

  const byChar =
    content.length > COLLAPSED_PREVIEW_CHAR_LIMIT
      ? content.slice(0, COLLAPSED_PREVIEW_CHAR_LIMIT).trimEnd()
      : null;

  if (byLine === null && byChar === null) return content;

  const preview =
    byLine !== null && byChar !== null
      ? byLine.length <= byChar.length
        ? byLine
        : byChar
      : (byLine ?? byChar)!;

  return `${preview}\u2026`;
};
