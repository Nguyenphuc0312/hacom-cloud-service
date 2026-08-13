import type { ComposerMode } from "../../../hooks/useComposerAvailability";
import { normalizeSearchText } from "../../../utils/contactSearchMatch";
import type { MentionCandidate, MentionMatch } from "./types";

export const shouldRenderCompactStatusBar = (composerMode: ComposerMode): boolean =>
  composerMode === "reconnecting" ||
  composerMode === "offline" ||
  composerMode === "unauthenticated";

/** Tên dài nhất còn hợp lý ("Nguyễn Thế Huy Hoàng" = 4 từ). Quá số này thì "@"
 *  đó là chữ trong câu, không phải người đang gõ tag. */
const MENTION_QUERY_MAX_WORDS = 5;

/**
 * Ký tự đứng ngay trước "@" quyết định đó có phải lệnh tag không — đúng luật
 * Zalo: chỉ đầu dòng hoặc sau khoảng trắng.
 *
 * Vì sao SIẾT lại (trước đây mở ở mọi vị trí): "@" dính vào từ trước gần như
 * luôn là chữ trong câu chứ không phải tag — `mail@cty`, `50@kg`, `a@b.com`.
 * Mở panel ở những chỗ đó khiến panel bung giữa lúc gõ email và — tệ hơn —
 * nuốt luôn phím Enter (Enter lúc panel mở là "chọn tag", không phải "gửi"),
 * nên người dùng gõ địa chỉ mail rồi Enter thì tin không gửi đi.
 *
 * Đổi lại, tag dính từ ("bạn@nhật") không còn mở panel — giống hệt Zalo, và
 * người dùng đã quen luật này ở Zalo/Messenger/Slack.
 */
const canStartMention = (charBefore: string | undefined): boolean =>
  charBefore === undefined || /[\s(["'“‘\-–—/]/.test(charBefore);

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

  // Luật Zalo: "@" phải mở đầu một từ. Xem `canStartMention`.
  if (!canStartMention(beforeCaret[mentionStart - 1])) {
    return null;
  }

  const mentionQuery = beforeCaret.slice(mentionStart + 1);
  if (mentionQuery.includes("\n") || mentionQuery.includes("\t")) {
    return null;
  }

  // "@" rồi gõ ngay dấu cách = người dùng không định tag ai (Zalo đóng panel
  // luôn ở đây). Không chặn thì panel treo hiện cả danh sách trong khi họ đang
  // viết câu bình thường, và Enter bị nuốt mất.
  if (mentionQuery.startsWith(" ")) {
    return null;
  }

  // Khoảng trắng GIỮA các từ vẫn được phép: tên người Việt gần như luôn có dấu
  // cách ("@Huy Hoàng"). Chặn hẳn dấu cách làm panel đóng ngay sau từ đầu tiên,
  // người gõ tưởng đã tag nhưng thực ra chỉ là chữ thường — không highlight,
  // người được nhắc không nhận thông báo. Giới hạn số từ để "@" giữa câu không
  // biến cả phần còn lại thành query.
  if (mentionQuery.split(" ").length > MENTION_QUERY_MAX_WORDS) {
    return null;
  }

  // Allow any Unicode letter/number so Vietnamese (and other accented) names can
  // be typed/searched after "@". The previous ASCII-only pattern dropped the
  // match the moment a diacritic (e.g. "ậ" in "nhật") was typed, closing the
  // mention panel and making it impossible to mention Vietnamese names.
  if (!/^[\p{L}\p{N}._ -]*$/u.test(mentionQuery)) {
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

/**
 * Mọi chữ có thể dùng để tìm ra một người. `aliasLabel` ("tên gợi nhớ" riêng của
 * người xem) nằm trong đây vì họ tìm bằng cái tên họ đặt — nhưng nó chỉ phục vụ
 * TÌM KIẾM, không bao giờ đi vào nội dung tin nhắn.
 */
const candidateHaystacks = (candidate: MentionCandidate): string[] =>
  [
    candidate.aliasLabel,
    candidate.mentionInsertName,
    candidate.resolvedName,
    candidate.fullName,
    candidate.displayName,
    candidate.username,
    candidate.employeeCode,
  ].filter((value): value is string => Boolean(value && value.trim()));

/**
 * Điểm khớp của một người với từ khóa sau "@". `null` = không khớp, bị loại.
 * Số NHỎ hơn = xếp trên.
 *
 * Thang điểm bám theo cách Zalo xếp: gõ "@ho" thì "Hoàng" (khớp đầu tên) phải
 * đứng trên "Nguyễn Văn Ho..." (khớp đầu một từ giữa), và cả hai đứng trên
 * người chỉ khớp lửng giữa chuỗi. Không xếp hạng thì `includes()` trả về theo
 * thứ tự thành viên trong nhóm — người hay được tag nhất lại nằm cuối danh sách.
 */
const scoreMentionCandidate = (
  candidate: MentionCandidate,
  normalizedQuery: string,
): number | null => {
  let best: number | null = null;

  const consider = (score: number) => {
    if (best === null || score < best) best = score;
  };

  for (const haystack of candidateHaystacks(candidate)) {
    const value = normalizeSearchText(haystack);
    if (!value) continue;

    if (value === normalizedQuery) {
      consider(0); // khớp nguyên tên
    } else if (value.startsWith(normalizedQuery)) {
      consider(1); // khớp đầu tên: "@ho" → "Hoàng"
    } else if (
      // Khớp đầu một TỪ bên trong tên: "@hoang" → "Nguyễn Thế Huy Hoàng".
      // Đây là cách người Việt gọi nhau (bằng tên, không phải họ), nên phải
      // đứng trên khớp lửng giữa chuỗi.
      value.split(/\s+/).some((word) => word.startsWith(normalizedQuery))
    ) {
      consider(2);
    } else if (value.includes(normalizedQuery)) {
      consider(3); // khớp lửng — vẫn nhận, nhưng xếp cuối
    }
  }

  return best;
};

/**
 * Lọc + xếp hạng danh sách gợi ý cho panel tag.
 *
 * Bỏ dấu hai đầu (`normalizeSearchText`) là điểm mấu chốt: gõ không dấu là thói
 * quen mặc định của người Việt, mà `includes()` có dấu như trước thì "@nhat"
 * KHÔNG ra "Nguyễn Minh Nhật" — người dùng tưởng người đó không có trong nhóm.
 *
 * Giữ thứ tự gốc khi điểm bằng nhau (`sort` của JS ổn định) để danh sách không
 * nhảy lung tung giữa các lần gõ.
 */
export const filterMentionCandidates = (
  candidates: MentionCandidate[],
  query: string,
): MentionCandidate[] => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return candidates;

  return candidates
    .map((candidate) => ({
      candidate,
      score: scoreMentionCandidate(candidate, normalizedQuery),
    }))
    .filter(
      (entry): entry is { candidate: MentionCandidate; score: number } =>
        entry.score !== null,
    )
    .sort((a, b) => a.score - b.score)
    .map((entry) => entry.candidate);
};
