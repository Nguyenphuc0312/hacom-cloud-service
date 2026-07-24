import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { UserGroupIcon } from "@heroicons/react/24/solid";
import { Avatar } from "../../common/Avatar";
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
        "absolute bottom-full left-2 right-2 z-dropdown mb-2 max-h-72 overflow-y-auto rounded-xl border border-border bg-surface-raised shadow-elev2",
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

          // WYSIWYG (Zalo model): the primary is exactly the name that gets
          // inserted and shown in the bubble — one shared name for everyone.
          // The private alias is NOT used for tags. Secondary = dept · company.
          const primaryLabel = isMentionAll
            ? t("chat:composer.mentionAllLabel")
            : candidate.mentionInsertName ||
              candidate.resolvedName ||
              candidate.displayName ||
              candidate.username;
          const secondaryLabel = isMentionAll
            ? t("chat:composer.mentionAllDescription")
            : ([candidate.departmentName, candidate.companyName]
                .filter(Boolean)
                .join(" · ") || null);
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
              {isMentionAll ? (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  <UserGroupIcon className="h-4 w-4" aria-hidden="true" />
                </span>
              ) : (
                <Avatar src={candidate.avatarUrl} alt={primaryLabel} size="sm" />
              )}
              <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
                <span
                  className={clsx(
                    "shrink-0 truncate text-sm font-medium",
                    isMentionAll && "text-amber-600 dark:text-amber-400",
                  )}
                >
                  {primaryLabel}
                </span>
                {secondaryLabel && (
                  <span className="min-w-0 truncate text-xs text-text-muted">
                    {secondaryLabel}
                  </span>
                )}
              </span>
            </button>
          );
        })
      )}
    </div>
  );
};
