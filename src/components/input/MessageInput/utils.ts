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

  // Allow any Unicode letter/number so Vietnamese (and other accented) names can
  // be typed/searched after "@". The previous ASCII-only pattern dropped the
  // match the moment a diacritic (e.g. "ậ" in "nhật") was typed, closing the
  // mention panel and making it impossible to mention Vietnamese names.
  if (!/^[\p{L}\p{N}._-]*$/u.test(mentionQuery)) {
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
      departmentName: candidate.departmentName,
      companyName: candidate.companyName,
      // Local-only alias label — carried through so the suggestion row can show
      // it and the filter can match it. Never feeds the inserted tag.
      aliasLabel: candidate.aliasLabel?.trim() || undefined,
      avatarUrl: candidate.avatarUrl?.trim() || undefined,
      // The short nick we insert; fall back to displayName/username here.
      mentionInsertName:
        candidate.mentionInsertName?.trim() ||
        candidate.displayName?.trim() ||
        username,
      resolvedName,
    });
  });

  return normalized;
};
