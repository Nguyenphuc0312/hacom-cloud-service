import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import type { MentionCandidate } from "./types";

interface ComposerMentionPanelProps {
  mentionListId: string;
  activeMentionIndex: number;
  mentionSuggestions: MentionCandidate[];
  onSelectMention: (candidate: MentionCandidate) => void;
}

export const ComposerMentionPanel: React.FC<ComposerMentionPanelProps> = ({
  mentionListId,
  activeMentionIndex,
  mentionSuggestions,
  onSelectMention,
}) => {
  const { t } = useTranslation();

  return (
    <div
      id={mentionListId}
      role="listbox"
      aria-label={t("chat:composer.mentionList")}
      aria-activedescendant={`${mentionListId}-option-${activeMentionIndex}`}
      className={clsx(
        "absolute bottom-full left-2 right-2 z-dropdown mb-2 max-h-52 overflow-y-auto rounded-xl border border-border bg-surface-raised shadow-elev2",
        "p-1",
      )}
    >
      {mentionSuggestions.length === 0 ? (
        <p className="px-3 py-2 text-xs text-text-muted">
          {t("chat:composer.noMentionResults")}
        </p>
      ) : (
        mentionSuggestions.map((candidate, index) => {
          const isActive = index === activeMentionIndex;
          const isMentionAll = candidate.id === "all";

          // Primary: resolved full name / display name
          const primaryLabel = isMentionAll
            ? t("chat:composer.mentionAllLabel")
            : (candidate.resolvedName ||
              candidate.displayName ||
              candidate.fullName ||
              candidate.username);
          // Secondary: employee code or username for disambiguation
          const secondaryLabel = isMentionAll
            ? t("chat:composer.mentionAllDescription")
            : (candidate.employeeCode && candidate.employeeCode !== primaryLabel
              ? candidate.employeeCode
              : candidate.username && candidate.username !== primaryLabel
                ? `@${candidate.username}`
                : null);
          return (
            <button
              key={`${candidate.id}:${candidate.username}`}
              id={`${mentionListId}-option-${index}`}
              type="button"
              role="option"
              aria-selected={isActive}
              className={clsx(
                "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left",
                "transition-colors",
                isActive
                  ? isMentionAll
                    ? "bg-amber-500/10 text-text-primary"
                    : "bg-[#1976D2]/10 text-text-primary"
                  : "text-text-secondary hover:bg-surface-hover",
              )}
              onMouseDown={(event) => {
                event.preventDefault();
                onSelectMention(candidate);
              }}
            >
              <span className={clsx("truncate text-sm font-medium", isMentionAll && "text-amber-600 dark:text-amber-400")}>
                {primaryLabel}
              </span>
              {secondaryLabel && (
                <span className="truncate text-xs text-text-muted">
                  {secondaryLabel}
                </span>
              )}
            </button>
          );
        })
      )}
    </div>
  );
};
