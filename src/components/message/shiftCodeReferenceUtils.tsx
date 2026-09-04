import React from "react";
import clsx from "clsx";
import {
  FALLBACK_WORK_SHIFT_MATCHER,
  type WorkShiftCodeMatcher,
} from "../../hooks/useWorkShiftCatalog";

const HTML_TAG_REGEX = /(<[^>]+>)/g;
const HTML_TAG_NAME_REGEX = /^<\s*(\/)?\s*([a-z0-9-]+)/i;
const HTML_TEXT_SKIP_TAGS = new Set(["a", "button", "code", "pre"]);
const WORD_CHARACTER_REGEX = /[\p{L}\p{N}_]/u;

export interface ShiftCodeSegment {
  text: string;
  code?: string;
}

const isWordCharacter = (value: string | undefined): boolean =>
  Boolean(value && WORD_CHARACTER_REGEX.test(value));

export function tokenizeShiftCodes(
  text: string,
  matcher: WorkShiftCodeMatcher = FALLBACK_WORK_SHIFT_MATCHER,
): ShiftCodeSegment[] {
  if (!text || !matcher.pattern) return text ? [{ text }] : [];

  const segments: ShiftCodeSegment[] = [];
  const regex = new RegExp(matcher.pattern, "giu");
  let lastIndex = 0;

  for (const match of text.matchAll(regex)) {
    const index = match.index ?? 0;
    const end = index + match[0].length;
    if (isWordCharacter(text[index - 1]) || isWordCharacter(text[end])) {
      continue;
    }

    const code = match[0].toUpperCase();
    if (!matcher.codes.has(code)) continue;
    if (index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, index) });
    }
    segments.push({ text: match[0], code });
    lastIndex = end;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex) });
  }
  return segments.length > 0 ? segments : [{ text }];
}

const escapeHtmlAttribute = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const shiftCodeButtonHtml = (text: string, code: string, isOwn: boolean) =>
  `<button type="button" class="shift-code-trigger${isOwn ? " shift-code-trigger--own" : ""}" data-shift-code="${escapeHtmlAttribute(code)}" aria-haspopup="dialog">${text}</button>`;

export function linkifyShiftCodesInHtml(
  safeHtml: string,
  isOwn: boolean,
  matcher: WorkShiftCodeMatcher = FALLBACK_WORK_SHIFT_MATCHER,
): string {
  const blockedTags: string[] = [];

  return safeHtml
    .split(HTML_TAG_REGEX)
    .map((part) => {
      if (part.startsWith("<")) {
        const match = part.match(HTML_TAG_NAME_REGEX);
        if (!match) return part;

        const tagName = match[2].toLowerCase();
        if (!HTML_TEXT_SKIP_TAGS.has(tagName)) return part;

        if (match[1]) {
          const index = blockedTags.lastIndexOf(tagName);
          if (index >= 0) blockedTags.splice(index, 1);
        } else if (!/\/\s*>$/.test(part)) {
          blockedTags.push(tagName);
        }
        return part;
      }

      if (blockedTags.length > 0) return part;
      return tokenizeShiftCodes(part, matcher)
        .map((segment) =>
          segment.code
            ? shiftCodeButtonHtml(segment.text, segment.code, isOwn)
            : segment.text,
        )
        .join("");
    })
    .join("");
}

export const renderShiftCodeText = (
  text: string,
  isOwn: boolean,
  onSelect: (code: string) => void,
  accessibleLabel: (code: string) => string,
  matcher: WorkShiftCodeMatcher = FALLBACK_WORK_SHIFT_MATCHER,
  keyPrefix = "shift",
): React.ReactNode[] =>
  tokenizeShiftCodes(text, matcher).map((segment, index) =>
    segment.code ? (
      <button
        key={`${keyPrefix}-${index}`}
        type="button"
        className={clsx(
          "shift-code-trigger",
          isOwn && "shift-code-trigger--own",
        )}
        aria-haspopup="dialog"
        aria-label={accessibleLabel(segment.code)}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(segment.code!);
        }}
      >
        {segment.text}
      </button>
    ) : (
      <React.Fragment key={`${keyPrefix}-${index}`}>
        {segment.text}
      </React.Fragment>
    ),
  );
