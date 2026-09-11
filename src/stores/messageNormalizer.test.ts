import { describe, expect, it } from "vitest";

import {
  normalizeAttachments,
  normalizeLocationPayload,
  normalizeMentions,
  normalizeReactions,
  toDateObject,
} from "./messageNormalizer";

describe("toDateObject", () => {
  it("giữ nguyên Date hợp lệ", () => {
    const date = new Date("2026-03-01T10:00:00.000Z");
    expect(toDateObject(date)).toBe(date);
  });

  it("nhận chuỗi ISO và số epoch", () => {
    expect(toDateObject("2026-03-01T10:00:00.000Z").toISOString()).toBe(
      "2026-03-01T10:00:00.000Z",
    );
    expect(toDateObject(0).getTime()).toBe(0);
  });

  it("giá trị rác thì trả fallback, không ném lỗi", () => {
    const fallback = new Date("2020-01-01T00:00:00.000Z");
    expect(toDateObject("khong-phai-ngay", fallback)).toBe(fallback);
    expect(toDateObject(null, fallback)).toBe(fallback);
    expect(toDateObject(new Date("x"), fallback)).toBe(fallback);
  });
});

describe("normalizeAttachments", () => {
  it("không phải mảng thì trả mảng rỗng", () => {
    expect(normalizeAttachments(null)).toEqual([]);
    expect(normalizeAttachments({})).toEqual([]);
  });

  it("loại bỏ item thiếu id, hoặc thiếu cả objectKey lẫn url", () => {
    const result = normalizeAttachments([
      { id: "a", url: "https://x/a.png" },
      { url: "https://x/khong-id.png" }, // thiếu id
      { id: "c" }, // không có nơi lấy nội dung
      { id: "d", objectKey: "private/d" },
    ]);
    expect(result.map((item) => item.id)).toEqual(["a", "d"]);
  });

  it("chấp nhận fileId thay cho id, và các biến thể tên trường", () => {
    const [attachment] = normalizeAttachments([
      {
        fileId: "f1",
        fileUrl: "https://x/f.png",
        filename: "anh.png",
        mimetype: "image/png",
        size: 2048,
      },
    ]);
    expect(attachment.id).toBe("f1");
    expect(attachment.url).toBe("https://x/f.png");
    expect(attachment.fileName).toBe("anh.png");
    expect(attachment.mimeType).toBe("image/png");
    expect(attachment.fileSize).toBe(2048);
  });

  it("thiếu type thì mặc định 'other'", () => {
    const [attachment] = normalizeAttachments([
      { id: "a", url: "https://x/a.bin" },
    ]);
    expect(attachment.type).toBe("other");
  });

  it("giữ capability bảo mật khi server trả về", () => {
    const [attachment] = normalizeAttachments([
      {
        id: "safe-state",
        url: "https://x/safe-state.bin",
        scanStatus: "scanning",
        releaseStatus: "blocked",
        releaseReason: "FILE_SCAN_IN_PROGRESS",
        canAttach: false,
        canDownload: false,
        canPreview: false,
      },
    ]);

    expect(attachment).toMatchObject({
      scanStatus: "scanning",
      releaseStatus: "blocked",
      releaseReason: "FILE_SCAN_IN_PROGRESS",
      canAttach: false,
      canDownload: false,
      canPreview: false,
    });
  });
});

describe("normalizeReactions", () => {
  it("giữ nguyên dạng đã gộp sẵn (có userIds)", () => {
    const grouped = [{ emoji: "👍", userIds: ["u1", "u2"], count: 2 }];
    expect(normalizeReactions(grouped)).toBe(grouped);
  });

  it("gộp dạng phẳng theo emoji và đếm đúng", () => {
    const result = normalizeReactions([
      { emoji: "👍", userId: "u1" },
      { emoji: "👍", userId: "u2" },
      { emoji: "❤️", senderId: "u1" },
    ]);
    expect(result).toEqual([
      { emoji: "👍", userIds: ["u1", "u2"], count: 2 },
      { emoji: "❤️", userIds: ["u1"], count: 1 },
    ]);
  });

  it("cùng user thả trùng emoji chỉ tính một lần", () => {
    const result = normalizeReactions([
      { emoji: "👍", userId: "u1" },
      { emoji: "👍", user_id: "u1" },
    ]);
    expect(result).toEqual([{ emoji: "👍", userIds: ["u1"], count: 1 }]);
  });

  it("bỏ qua entry thiếu emoji hoặc thiếu userId", () => {
    expect(
      normalizeReactions([{ emoji: "👍" }, { userId: "u1" }, null]),
    ).toEqual([]);
  });
});

describe("normalizeMentions", () => {
  it("chấp nhận dạng cũ string[] và gắn displayName rỗng", () => {
    expect(normalizeMentions(["u1", " u2 "])).toEqual([
      { userId: "u1", displayName: "" },
      { userId: "u2", displayName: "" },
    ]);
  });

  it("đọc được dạng object cùng các biến thể snake_case", () => {
    expect(
      normalizeMentions([
        { user_id: "u1", display_name: "Nhật", employee_code: "HC000001" },
      ]),
    ).toEqual([
      { userId: "u1", displayName: "Nhật", employeeCode: "HC000001" },
    ]);
  });

  it("không gắn field rỗng vào kết quả", () => {
    const [mention] = normalizeMentions([{ userId: "u1" }]);
    expect(mention).toEqual({ userId: "u1", displayName: "" });
    expect(mention).not.toHaveProperty("employeeCode");
    expect(mention).not.toHaveProperty("avatarUrl");
  });

  it("bỏ qua entry không có userId", () => {
    expect(normalizeMentions([{ displayName: "X" }, "", null])).toEqual([]);
  });

  it("giữ range để renderer định vị mention không cần đoán theo tên", () => {
    expect(
      normalizeMentions([
        { user_id: "u1", display_name: "Nguyễn Minh Quang", offset: 0, length: 24 },
      ]),
    ).toEqual([
      { userId: "u1", displayName: "Nguyễn Minh Quang", offset: 0, length: 24 },
    ]);
  });
});

describe("normalizeLocationPayload", () => {
  const validLocation = {
    latitude: 21.0278,
    longitude: 105.8342,
    capturedAt: "2026-03-01T10:00:00.000Z",
  };

  it("tìm được location ở nhiều vị trí lồng nhau", () => {
    for (const source of [
      { location: validLocation },
      { content: { location: validLocation } },
      { metadata: { location: validLocation } },
      { locationData: validLocation },
    ]) {
      expect(normalizeLocationPayload(source)).toMatchObject({
        latitude: 21.0278,
        longitude: 105.8342,
      });
    }
  });

  it("chấp nhận lat/lng viết tắt", () => {
    expect(
      normalizeLocationPayload({
        location: { lat: 10, lng: 20, captured_at: "2026-03-01T10:00:00.000Z" },
      }),
    ).toMatchObject({ latitude: 10, longitude: 20 });
  });

  it("loại toạ độ ngoài phạm vi hợp lệ", () => {
    for (const bad of [
      { ...validLocation, latitude: 91 },
      { ...validLocation, latitude: -91 },
      { ...validLocation, longitude: 181 },
      { ...validLocation, longitude: -181 },
    ]) {
      expect(normalizeLocationPayload({ location: bad })).toBeUndefined();
    }
  });

  it("thiếu capturedAt thì coi như không có vị trí", () => {
    expect(
      normalizeLocationPayload({ location: { latitude: 10, longitude: 20 } }),
    ).toBeUndefined();
  });

  it("không có location thì trả undefined", () => {
    expect(normalizeLocationPayload({})).toBeUndefined();
  });

  it("chỉ gắn accuracyM khi có giá trị", () => {
    expect(normalizeLocationPayload({ location: validLocation })).not.toHaveProperty(
      "accuracyM",
    );
    expect(
      normalizeLocationPayload({
        location: { ...validLocation, accuracy_m: 12 },
      }),
    ).toMatchObject({ accuracyM: 12 });
  });
});
