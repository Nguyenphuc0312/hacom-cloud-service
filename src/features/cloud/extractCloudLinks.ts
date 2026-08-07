export type CloudLink = {
  messageId: string;
  url: string;
  host: string;
  createdAt?: string | Date;
};

const URL_PATTERN = /https?:\/\/[^\s<>"')]+/gi;

/**
 * Link do người dùng gửi trong Cloud, mới nhất lên đầu.
 *
 * Nội dung soạn bằng Tiptap nên có thể là HTML: khi đó lấy thẳng `href` của thẻ `<a>`
 * thay vì dò regex trên chuỗi thẻ — dò regex sẽ bắt trùng cả href lẫn phần chữ hiển thị.
 */
export const extractCloudLinks = (
  messages: { id: string; content?: string | null; createdAt?: string | Date }[],
): CloudLink[] => {
  const seen = new Set<string>();
  const links: CloudLink[] = [];

  for (const message of messages) {
    const raw = message.content ?? "";
    const isHtml = /<[a-z][\s\S]*>/i.test(raw);
    const candidates = isHtml
      ? Array.from(
          new DOMParser().parseFromString(raw, "text/html").querySelectorAll("a[href]"),
        ).map((anchor) => anchor.getAttribute("href") ?? "")
      : (raw.match(URL_PATTERN) ?? []);

    for (const candidate of candidates) {
      // Bỏ dấu câu dính ở cuối câu ("...google.com." → "...google.com").
      const url = candidate.replace(/[.,;:!?)\]]+$/, "");
      if (!url || seen.has(url)) continue;

      let host: string;
      try {
        host = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        continue; // chuỗi trông giống URL nhưng không phân tích được thì bỏ qua
      }

      seen.add(url);
      links.push({ messageId: message.id, url, host, createdAt: message.createdAt });
    }
  }

  return links.reverse();
};

export default extractCloudLinks;
