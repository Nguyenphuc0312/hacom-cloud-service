import type { ComposerMode } from "../../../hooks/useComposerAvailability";
import type { MentionCandidate, MentionMatch } from "./types";

export const shouldRenderCompactStatusBar = (composerMode: ComposerMode): boolean =>
  composerMode === "reconnecting" ||
  composerMode === "offline" ||
  composerMode === "unauthenticated";

export const buildMentionMatch = (
  text: string,
  caret: number,
): MentionMatch | null => {
  if (caret < 0 || caret > text.length) {
    return null;
  }

  const beforeCaret = text.slice(0, caret);
  const mentionStart = beforeCaret.lastIndexOf("@");
  if (mentionStart < 0) {
    return null;
  }

  const prefixChar = mentionStart === 0 ? " " : beforeCaret[mentionStart - 1];
  const isValidPrefix = /\s|\(|\[|\{|"|'|`/.test(prefixChar);
  if (!isValidPrefix) {
    return null;
  }

  const mentionQuery = beforeCaret.slice(mentionStart + 1);
  if (
    mentionQuery.includes(" ") ||
    mentionQuery.includes("\n") ||
    mentionQuery.includes("\t")
  ) {
    return null;
  }

  if (!/^[a-zA-Z0-9._-]*$/.test(mentionQuery)) {
    return null;
  }

  return {
    start: mentionStart,
    end: caret,
    query: mentionQuery,
  };
};

export const normalizeMentionCandidates = (
  mentionCandidates: MentionCandidate[],
): MentionCandidate[] => {
  const seen = new Set<string>();
  const normalized: MentionCandidate[] = [];

  mentionCandidates.forEach((candidate) => {
    const username = candidate.username.trim();
    if (!username) return;

    const key = `${candidate.id}:${username.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);

    // Resolve the primary display name: fullName > displayName > username
    const resolvedName =
      candidate.fullName?.trim() ||
      candidate.displayName?.trim() ||
      username;

    normalized.push({
      id: candidate.id,
      username,
      displayName: candidate.displayName?.trim() || undefined,
      fullName: candidate.fullName?.trim() || undefined,
      employeeCode: candidate.employeeCode?.trim() || undefined,
      resolvedName,
    });
  });

  return normalized;
};
