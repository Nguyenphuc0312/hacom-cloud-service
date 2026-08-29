import React from "react";
import clsx from "clsx";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import type { WorkShiftCatalogItem } from "../../features/api/hrApi";
import {
  FALLBACK_WORK_SHIFT_MATCHER,
  type WorkShiftCodeMatcher,
  useWorkShiftCatalog,
} from "../../hooks/useWorkShiftCatalog";
import { Button, Modal } from "../ui";

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

const formatDuration = (
  minutes: number,
  t: ReturnType<typeof useTranslation>["t"],
): string => {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours && remainingMinutes) {
    return t("chat:shiftReference.durationHoursMinutes", {
      hours,
      minutes: remainingMinutes,
    });
  }
  if (hours) {
    return t("chat:shiftReference.durationHours", { hours });
  }
  return t("chat:shiftReference.durationMinutes", { minutes });
};

const formatWorkdayValue = (
  value: number,
  language: string,
  t: ReturnType<typeof useTranslation>["t"],
): string =>
  t("chat:shiftReference.workdayValue", {
    value: new Intl.NumberFormat(language, {
      maximumFractionDigits: 2,
    }).format(value),
  });

const formatShiftTime = (shift: WorkShiftCatalogItem): string =>
  `${shift.startTime}–${shift.endTime}`;

interface ShiftCatalogModalProps {
  code: string;
  onClose: () => void;
}

export const ShiftCatalogModal: React.FC<ShiftCatalogModalProps> = ({
  code,
  onClose,
}) => {
  const { t, i18n } = useTranslation();
  const { items, error, refetch } = useWorkShiftCatalog();
  const [query, setQuery] = React.useState("");
  const searchId = React.useId();

  React.useEffect(() => {
    void refetch();
  }, [refetch]);

  const selectedCode = code.toUpperCase();
  const selectedShift = items?.find(
    (shift) => shift.code.toUpperCase() === selectedCode,
  );
  const normalizedQuery = query.trim().toLocaleLowerCase(i18n.language);
  const filteredItems =
    items?.filter((shift) =>
      [shift.code, shift.name, shift.groupName ?? ""].some((value) =>
        value.toLocaleLowerCase(i18n.language).includes(normalizedQuery),
      ),
    ) ?? [];

  const renderWorkValue = (shift: WorkShiftCatalogItem) =>
    `${formatDuration(shift.standardMinutes, t)} / ${formatWorkdayValue(
      shift.dayValue,
      i18n.language,
      t,
    )}`;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t("chat:shiftReference.title")}
      description={
        selectedShift
          ? t("chat:shiftReference.selectedDescription", {
              code: selectedShift.code,
              name: selectedShift.name,
            })
          : t("chat:shiftReference.description")
      }
      size="full"
      bodyClassName="!p-0"
    >
      {selectedShift ? (
        <section className="border-b border-border bg-surface-overlay/55 px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="shrink-0 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-sm font-bold text-primary">
                {selectedShift.code}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-text-primary">
                  {selectedShift.name}
                </p>
                <p className="truncate text-xs text-text-secondary">
                  {selectedShift.groupName ??
                    t("chat:shiftReference.ungrouped")}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:text-right">
              <span className="text-text-secondary">
                {t("chat:shiftReference.workingTime")}
              </span>
              <span className="font-medium tabular-nums text-text-primary">
                {formatShiftTime(selectedShift)}
              </span>
              <span className="text-text-secondary">
                {t("chat:shiftReference.breakTime")}
              </span>
              <span className="font-medium tabular-nums text-text-primary">
                {selectedShift.breakStart && selectedShift.breakEnd
                  ? `${selectedShift.breakStart}–${selectedShift.breakEnd}`
                  : t("chat:shiftReference.noBreakInfo")}
              </span>
            </div>
          </div>
        </section>
      ) : null}

      <div className="px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
        <label className="sr-only" htmlFor={searchId}>
          {t("chat:shiftReference.searchLabel")}
        </label>
        <div className="relative">
          <MagnifyingGlassIcon
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("chat:shiftReference.searchPlaceholder")}
            className="h-10 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </div>
      </div>

      {!items && !error ? (
        <div
          className="space-y-2 px-5 pb-6 sm:px-6"
          aria-live="polite"
          aria-label={t("chat:shiftReference.loading")}
        >
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="h-11 animate-pulse rounded-md bg-surface-overlay motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : null}

      {error && !items ? (
        <div className="px-5 pb-6 sm:px-6" role="alert">
          <div className="rounded-lg border border-danger/25 bg-danger/5 p-4">
            <p className="text-sm font-semibold text-text-primary">
              {t("chat:shiftReference.loadErrorTitle")}
            </p>
            <p className="mt-1 text-sm text-text-secondary">
              {t("chat:shiftReference.loadErrorDescription")}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void refetch()}
            >
              {t("chat:shiftReference.retry")}
            </Button>
          </div>
        </div>
      ) : null}

      {items ? (
        <div className="border-t border-border">
          {filteredItems.length > 0 ? (
            <>
              <div className="hidden max-h-[24rem] overflow-auto md:block">
                <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
                  <caption className="sr-only">
                    {t("chat:shiftReference.tableCaption")}
                  </caption>
                  <thead className="sticky top-0 z-10 bg-surface-overlay">
                    <tr className="border-b border-border text-xs font-semibold text-text-secondary">
                      <th className="px-6 py-3">
                        {t("chat:shiftReference.columns.code")}
                      </th>
                      <th className="px-4 py-3">
                        {t("chat:shiftReference.columns.name")}
                      </th>
                      <th className="px-4 py-3">
                        {t("chat:shiftReference.columns.group")}
                      </th>
                      <th className="px-4 py-3">
                        {t("chat:shiftReference.columns.time")}
                      </th>
                      <th className="px-4 py-3 pr-6">
                        {t("chat:shiftReference.columns.workValue")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((shift) => {
                      const isSelected =
                        shift.code.toUpperCase() === selectedCode;
                      return (
                        <tr
                          key={shift.code}
                          className={clsx(
                            "border-b border-border/70 last:border-b-0",
                            isSelected
                              ? "bg-primary/8"
                              : "hover:bg-surface-hover/70",
                          )}
                        >
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-2">
                              <span
                                className={clsx(
                                  "rounded-md px-2 py-1 font-semibold",
                                  isSelected
                                    ? "bg-primary/12 text-primary"
                                    : "bg-surface-overlay text-text-primary",
                                )}
                              >
                                {shift.code}
                              </span>
                              {isSelected ? (
                                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                                  {t("chat:shiftReference.viewing")}
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-medium text-text-primary">
                            {shift.name}
                          </td>
                          <td className="px-4 py-3 text-text-secondary">
                            {shift.groupName ??
                              t("chat:shiftReference.ungrouped")}
                          </td>
                          <td className="px-4 py-3 tabular-nums text-text-primary">
                            {formatShiftTime(shift)}
                          </td>
                          <td className="px-4 py-3 pr-6 tabular-nums text-text-secondary">
                            {renderWorkValue(shift)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-border md:hidden">
                {filteredItems.map((shift) => {
                  const isSelected = shift.code.toUpperCase() === selectedCode;
                  return (
                    <li
                      key={shift.code}
                      className={clsx(
                        "px-5 py-4",
                        isSelected && "bg-primary/8",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={clsx(
                                "rounded-md px-2 py-1 text-sm font-semibold",
                                isSelected
                                  ? "bg-primary/12 text-primary"
                                  : "bg-surface-overlay text-text-primary",
                              )}
                            >
                              {shift.code}
                            </span>
                            {isSelected ? (
                              <span className="text-xs font-semibold text-primary">
                                {t("chat:shiftReference.viewing")}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-2 truncate text-sm font-medium text-text-primary">
                            {shift.name}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-text-secondary">
                            {shift.groupName ??
                              t("chat:shiftReference.ungrouped")}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-medium tabular-nums text-text-primary">
                            {formatShiftTime(shift)}
                          </p>
                          <p className="mt-1 text-xs tabular-nums text-text-secondary">
                            {renderWorkValue(shift)}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <div className="px-5 py-10 text-center sm:px-6" role="status">
              <p className="text-sm font-semibold text-text-primary">
                {t("chat:shiftReference.emptyTitle")}
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                {t("chat:shiftReference.emptyDescription")}
              </p>
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
};
