import type { Mention } from "../types";

/**
 * Cắt nội dung tin nhắn thành các đoạn văn bản thường + đoạn tag `@`.
 *
 * Có HAI đường, theo đúng thứ tự ưu tiên:
 *
 * 1. **Theo range** (`mention.offset`/`length`) — chính xác tuyệt đối, không đoán.
 *    Cần BE ship contract `FE__mention-structured-ranges__contract__30-07-26`.
 * 2. **Dò theo tên** — đường cũ, dùng cho tin nhắn gửi trước khi có range.
 *
 * Đường 2 tồn tại vì bug thật: FE và BE resolve tên theo hai thứ tự khác nhau
 * (`ChatWindow.tsx:1034` vs `message-write.service.ts:117`), nên chữ trong
 * `content` có thể KHÔNG khớp `mentions[].displayName`. Vì vậy nó match theo
 * *mọi biến thể tên đã biết* của user chứ không chỉ mỗi `displayName` —
 * xem `aliasesByUserId`.
 */

export interface MentionSegment {
  /** Chữ hiển thị đúng như trong nội dung gốc, gồm cả '@'. */
  text: string;
  /** userId nếu đoạn này là tag đã resolve được; undefined = văn bản thường. */
  userId?: string;
  /** Tag `@all` — highlight khác, không bấm được. */
  isAll?: boolean;
}

/** Các biến thể tên đã biết của một user, để dò tag trong tin nhắn cũ. */
export type MentionNameVariants = Record<string, readonly (string | undefined)[]>;

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Đếm theo code point — khớp đơn vị offset đã chốt trong contract. */
const toCodePoints = (value: string): string[] => Array.from(value);

const isMentionAllId = (userId: string | undefined): boolean =>
  userId === "all" || userId === "@all";

/**
 * Range hợp lệ = nằm trong chuỗi, có độ dài dương, và không đè lên range trước.
 * Client vẫn tự kiểm tra dù BE đã validate (contract mục 3, phương án A) — dữ
 * liệu hỏng chỉ nên làm mất highlight, không được cắt vỡ nội dung tin nhắn.
 */
const hasUsableRanges = (
  mentions: Mention[],
  totalCodePoints: number,
): boolean => {
  const ranged = mentions.filter(
    (m) => typeof m.offset === "number" && typeof m.length === "number",
  );
  if (ranged.length === 0) return false;

  const sorted = [...ranged].sort((a, b) => (a.offset ?? 0) - (b.offset ?? 0));
  let previousEnd = 0;
  for (const mention of sorted) {
    const start = mention.offset ?? 0;
    const length = mention.length ?? 0;
    if (!Number.isInteger(start) || !Number.isInteger(length)) return false;
    if (length <= 0 || start < previousEnd) return false;
    if (start + length > totalCodePoints) return false;
    previousEnd = start + length;
  }
  return true;
};

const segmentByRanges = (
  content: string,
  mentions: Mention[],
): MentionSegment[] => {
  const codePoints = toCodePoints(content);
  const ranged = mentions
    .filter((m) => typeof m.offset === "number" && typeof m.length === "number")
    .sort((a, b) => (a.offset ?? 0) - (b.offset ?? 0));

  const segments: MentionSegment[] = [];
  let cursor = 0;

  for (const mention of ranged) {
    const start = mention.offset ?? 0;
    const end = start + (mention.length ?? 0);
    if (start > cursor) {
      segments.push({ text: codePoints.slice(cursor, start).join("") });
    }
    segments.push({
      text: codePoints.slice(start, end).join(""),
      userId: isMentionAllId(mention.userId) ? undefined : mention.userId,
      isAll: isMentionAllId(mention.userId),
    });
    cursor = end;
  }

  if (cursor < codePoints.length) {
    segments.push({ text: codePoints.slice(cursor).join("") });
  }
  return segments;
};

/**
 * Gom mọi biến thể tên → userId. Tên dài match trước, để "@An Nguyen" không bị
 * "@An" ăn mất một nửa.
 *
 * Một tên trỏ về HAI user khác nhau (trùng tên thật) thì **bỏ hẳn tên đó**: thà
 * không highlight còn hơn gán nhầm tag sang người khác. Range (đường 1) không
 * dính vấn đề này.
 */
const buildNameLookup = (
  mentions: Mention[],
  aliasesByUserId?: MentionNameVariants,
): Map<string, string | null> => {
  const lookup = new Map<string, string | null>();

  const register = (name: string | undefined, userId: string) => {
    const key = name?.trim().toLowerCase();
    if (!key) return;
    const existing = lookup.get(key);
    if (existing === undefined) {
      lookup.set(key, userId);
    } else if (existing !== userId) {
      lookup.set(key, null); // mơ hồ → không dùng
    }
  };

  for (const mention of mentions) {
    if (isMentionAllId(mention.userId)) continue;
    register(mention.displayName, mention.userId);
    for (const variant of aliasesByUserId?.[mention.userId] ?? []) {
      register(variant, mention.userId);
    }
  }

  // Lượt 2 — gọi bằng phần đuôi tên là chuyện thường ("Nguyễn Thế Huy Hoàng" →
  // "@Huy Hoàng"). BE lưu tên đầy đủ vào `displayName`, nên chỉ dò đúng chuỗi
  // đó thì tag gõ tay mất hẳn highlight. Chạy SAU nên tên chính của người khác
  // luôn thắng hậu tố. Hậu tố ≥ 2 từ, và hậu tố nào hai người cùng sinh ra thì
  // huỷ hẳn — thà trượt highlight còn hơn tag nhầm sang người khác.
  const suffixOwner = new Map<string, string | null>();
  for (const mention of mentions) {
    if (isMentionAllId(mention.userId)) continue;
    for (const name of nameSuffixes(mention.displayName)) {
      const key = name.toLowerCase();
      if (lookup.has(key)) continue; // tên chính của ai đó — không đụng vào
      const owner = suffixOwner.get(key);
      suffixOwner.set(
        key,
        owner === undefined || owner === mention.userId ? mention.userId : null,
      );
    }
  }
  for (const [key, userId] of suffixOwner) {
    lookup.set(key, userId);
  }
  return lookup;
};

/** Các hậu tố ≥ 2 từ của một tên đầy đủ, dài trước ngắn sau. */
const nameSuffixes = (fullName: string | undefined): string[] => {
  const words = (fullName || "").trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 1; i <= words.length - 2; i++) out.push(words.slice(i).join(" "));
  return out;
};

const segmentByNames = (
  content: string,
  mentions: Mention[],
  aliasesByUserId?: MentionNameVariants,
): MentionSegment[] => {
  const lookup = buildNameLookup(mentions, aliasesByUserId);
  const hasMentionAll = mentions.some((m) => isMentionAllId(m.userId));

  const names = [...lookup.keys()];
  if (hasMentionAll) names.push("all");
  if (names.length === 0) return [{ text: content }];

  const alternation = [...new Set(names)]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|");
  // `(?![\p{L}\p{N}_])` chặn "@All" khớp vào giữa "@Allen".
  const regex = new RegExp(`@(?:${alternation})(?![\\p{L}\\p{N}_])`, "giu");

  const segments: MentionSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const token = match[0];
    const key = token.slice(1).toLowerCase();
    const userId = lookup.get(key);

    // Tên mơ hồ (null) → để nguyên như văn bản thường, không gán nhầm.
    if (userId === null) continue;

    if (match.index > lastIndex) {
      segments.push({ text: content.slice(lastIndex, match.index) });
    }
    segments.push(
      key === "all" && userId === undefined
        ? { text: token, isAll: true }
        : { text: token, userId },
    );
    lastIndex = match.index + token.length;
  }

  if (lastIndex < content.length) {
    segments.push({ text: content.slice(lastIndex) });
  }
  return segments.length > 0 ? segments : [{ text: content }];
};

/**
 * Cắt `content` thành đoạn thường + đoạn tag.
 *
 * `aliasesByUserId` là các biến thể tên bổ sung (tên HR / displayName / username
 * của participant) — chỉ dùng cho đường dò tên; truyền vào để vá ca FE↔BE lệch tên.
 */
export const buildMentionSegments = (
  content: string,
  mentions?: Mention[],
  aliasesByUserId?: MentionNameVariants,
): MentionSegment[] => {
  if (!content) return [{ text: content }];
  if (!mentions || mentions.length === 0) return [{ text: content }];

  return hasUsableRanges(mentions, toCodePoints(content).length)
    ? segmentByRanges(content, mentions)
    : segmentByNames(content, mentions, aliasesByUserId);
};
