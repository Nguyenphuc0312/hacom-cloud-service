import { describe, expect, it } from "vitest";
import { buildMentionMatch, filterMentionCandidates } from "./utils";
import type { MentionCandidate } from "./types";

/** Caret sits at the end of `text`, which is how typing behaves. */
const atEnd = (text: string) => buildMentionMatch(text, text.length);

describe("buildMentionMatch", () => {
  it("mở panel khi @ đứng đầu dòng hoặc sau khoảng trắng", () => {
    expect(atEnd("@")).not.toBeNull();
    expect(atEnd("bạn @")).not.toBeNull();
    expect(atEnd("(@")).not.toBeNull();
    expect(atEnd("nhờ @nhat")).not.toBeNull();
  });

  // Luật Zalo: "@" dính vào từ trước là chữ trong câu, không phải tag.
  // Mở panel ở đây làm hỏng việc gõ email — và tệ hơn là nuốt phím Enter,
  // khiến tin nhắn không gửi được.
  it("KHÔNG mở panel khi @ dính vào từ đứng trước", () => {
    expect(atEnd("bạn@")).toBeNull();
    expect(atEnd("a@b.com@")).toBeNull();
    expect(atEnd("mail@cty")).toBeNull();
    expect(atEnd("50@")).toBeNull();
  });

  // "@" rồi gõ ngay dấu cách = không định tag ai.
  it("đóng panel khi gõ dấu cách ngay sau @", () => {
    expect(atEnd("@ ")).toBeNull();
    expect(atEnd("chào @ mọi người")).toBeNull();
  });

  it("opens at the end of a long multi-line message that already has @all", () => {
    const text = [
      "Kính gửi HCNS các Đơn vị @all",
      "- Hiện tại đội phát triển phần mềm đã xử lí và phân quyền tất cả các tính năng.",
      "- VP TCT gửi lại hướng dẫn thực hiện bản PDF (chi tiết ở trên link đã gửi)",
      "- Mọi khó khăn vướng mắc có thể liên hệ trực tiếp bạn @",
    ].join("\n");

    expect(atEnd(text)).toEqual({
      start: text.lastIndexOf("@"),
      end: text.length,
      query: "",
    });
  });

  it("keeps matching while a Vietnamese name is being typed", () => {
    expect(atEnd("bạn @nhậ")?.query).toBe("nhậ");
    expect(atEnd("@Minh")?.query).toBe("Minh");
    expect(atEnd("@ho.va-ten_1")?.query).toBe("ho.va-ten_1");
  });

  // Tên người Việt gần như luôn có dấu cách. Chặn dấu cách (hành vi cũ) làm
  // panel đóng ngay sau từ đầu tiên: người gõ "@Huy Hoàng" tưởng đã tag, thực
  // ra chỉ là chữ thường — không highlight, người được nhắc không nhận báo.
  it("vẫn mở panel khi tên có dấu cách", () => {
    expect(atEnd("@Minh Quốc")?.query).toBe("Minh Quốc");
    expect(atEnd("@Nguyễn Thế Huy Hoàng")?.query).toBe("Nguyễn Thế Huy Hoàng");
  });

  it("đóng panel khi qua xuống dòng hoặc quá dài để còn là một cái tên", () => {
    expect(atEnd("@Minh\nQuốc")).toBeNull();
    // "@" giữa câu: phần còn lại của câu không được biến thành query.
    expect(atEnd("@gửi các bạn xem giúp mình nhé")).toBeNull();
  });

  it("matches against the caret, not the end of the text", () => {
    const text = "chào @ nhé";
    expect(buildMentionMatch(text, 6)).toEqual({ start: 5, end: 6, query: "" });
    // Caret before the "@" — nothing to match yet.
    expect(buildMentionMatch(text, 4)).toBeNull();
  });

  it("rejects an out-of-range caret", () => {
    expect(buildMentionMatch("@abc", -1)).toBeNull();
    expect(buildMentionMatch("@abc", 99)).toBeNull();
  });

  it("returns no match when there is no @ before the caret", () => {
    expect(atEnd("không có gì")).toBeNull();
  });
});

describe("filterMentionCandidates", () => {
  const candidate = (
    id: string,
    resolvedName: string,
    extra: Partial<MentionCandidate> = {},
  ): MentionCandidate => ({
    id,
    username: id,
    resolvedName,
    mentionInsertName: resolvedName,
    ...extra,
  });

  const nhat = candidate("u1", "Nguyễn Minh Nhật");
  const hoang = candidate("u2", "Nguyễn Thế Huy Hoàng");
  const duc = candidate("u3", "Bùi Văn Đức");
  const all = [nhat, hoang, duc];

  it("trả nguyên danh sách khi chưa gõ từ khóa", () => {
    expect(filterMentionCandidates(all, "")).toEqual(all);
    expect(filterMentionCandidates(all, "   ")).toEqual(all);
  });

  // Gõ không dấu là thói quen mặc định của người Việt. `includes()` có dấu
  // như trước thì "@nhat" không ra "Nhật" — người dùng tưởng người đó
  // không có trong nhóm.
  it("tìm được khi gõ KHÔNG DẤU", () => {
    expect(filterMentionCandidates(all, "nhat")).toEqual([nhat]);
    expect(filterMentionCandidates(all, "hoang")).toEqual([hoang]);
  });

  // đ/Đ không phải tổ hợp dấu nên NFD không tách được — phải map tay.
  it("xử lý được chữ đ", () => {
    expect(filterMentionCandidates(all, "duc")).toEqual([duc]);
    expect(filterMentionCandidates(all, "đuc")).toEqual([duc]);
  });

  it("vẫn tìm được khi gõ CÓ DẤU", () => {
    expect(filterMentionCandidates(all, "Nhật")).toEqual([nhat]);
  });

  it("xếp khớp-đầu-tên lên trên khớp-lửng-giữa-chuỗi", () => {
    const hoa = candidate("u4", "Hoa");
    const ngocHoa = candidate("u5", "Trần Ngọc Hoa");
    // "Hoa" khớp nguyên tên → đứng trên "Trần Ngọc Hoa" (khớp đầu một từ giữa).
    expect(filterMentionCandidates([ngocHoa, hoa], "hoa")).toEqual([
      hoa,
      ngocHoa,
    ]);
  });

  it("tìm theo tên gợi nhớ riêng của người xem", () => {
    const withAlias = candidate("u6", "Trần Văn Bình", {
      aliasLabel: "Sếp Bình",
    });
    expect(filterMentionCandidates([withAlias], "sep")).toEqual([withAlias]);
  });

  it("loại hết khi không ai khớp", () => {
    expect(filterMentionCandidates(all, "abcxyz")).toEqual([]);
  });
});
