import { describe, expect, it } from "vitest";

import {
  asNumberValue,
  asRecord,
  asString,
  asStringValue,
} from "./payloadGuards";

describe("asRecord", () => {
  it("nhận object và mảng", () => {
    const obj = { a: 1 };
    expect(asRecord(obj)).toBe(obj);
    expect(asRecord([1, 2])).toEqual([1, 2]);
  });

  it("null / kiểu nguyên thuỷ → null", () => {
    for (const value of [null, undefined, 1, "x", true]) {
      expect(asRecord(value)).toBeNull();
    }
  });
});

describe("asString vs asStringValue — khác biệt CÓ CHỦ Ý", () => {
  it("cùng chấp nhận chuỗi không rỗng", () => {
    expect(asString("x")).toBe("x");
    expect(asStringValue("x")).toBe("x");
  });

  it("cùng từ chối chuỗi rỗng / toàn khoảng trắng", () => {
    expect(asString("   ")).toBeNull();
    expect(asStringValue("   ")).toBeUndefined();
  });

  it("khác nhau ở giá trị FALLBACK: null vs undefined", () => {
    // Đừng gộp hai hàm này — nơi gọi phụ thuộc đúng kiểu trả về.
    expect(asString(123)).toBeNull();
    expect(asStringValue(123)).toBeUndefined();
  });
});

describe("asNumberValue", () => {
  it("chỉ nhận số hữu hạn", () => {
    expect(asNumberValue(0)).toBe(0);
    expect(asNumberValue(-1.5)).toBe(-1.5);
    expect(asNumberValue(NaN)).toBeUndefined();
    expect(asNumberValue(Infinity)).toBeUndefined();
    expect(asNumberValue("5")).toBeUndefined();
  });
});
