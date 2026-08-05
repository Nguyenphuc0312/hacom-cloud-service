import { describe, it, expect } from "vitest";

/**
 * ExcelPreview gọi Object.freeze(Object.prototype) trước khi XLSX.read() để chặn
 * prototype pollution (GHSA-4r6h-8v6p-xvw6, npm không có bản vá).
 *
 * Freeze là VĨNH VIỄN và TOÀN CỤC — nên phải chắc nó không làm hỏng các thao tác
 * bình thường của app. Test này khoá lại điều đó: sau khi freeze, mọi thứ app
 * thật sự dùng vẫn chạy, chỉ ghi vào prototype là bị chặn.
 */
describe("Object.freeze(Object.prototype) — không làm hỏng app", () => {
  it("chặn được prototype pollution nhưng giữ nguyên hoạt động thường ngày", () => {
    Object.freeze(Object.prototype);

    // 1. Tấn công bị chặn
    const victim = JSON.parse('{"__proto__": {"isAdmin": true}}') as object;
    expect((victim as Record<string, unknown>).isAdmin).toBeUndefined();
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();

    // 2. Những thứ app dùng hằng ngày vẫn chạy bình thường
    const obj: Record<string, unknown> = { a: 1 };
    obj.b = 2; // ghi property trên object thường
    expect(obj).toEqual({ a: 1, b: 2 });

    expect({ ...obj, c: 3 }).toEqual({ a: 1, b: 2, c: 3 }); // spread
    expect(Object.assign({}, obj)).toEqual({ a: 1, b: 2 }); // assign
    expect(JSON.parse(JSON.stringify(obj))).toEqual({ a: 1, b: 2 }); // clone
    expect(Object.keys(obj)).toEqual(["a", "b"]);
    expect(structuredClone(obj)).toEqual({ a: 1, b: 2 });

    // 3. Class + kế thừa (zustand/redux dựng store bằng closure + object literal)
    class Base {
      value = 1;
    }
    class Child extends Base {
      double() {
        return this.value * 2;
      }
    }
    expect(new Child().double()).toBe(2);

    // 4. Map/Set/Array — cấu trúc dữ liệu chính của RTK cache
    expect(new Map([["k", 1]]).get("k")).toBe(1);
    expect([...new Set([1, 1, 2])]).toEqual([1, 2]);
    expect([3, 1, 2].sort()).toEqual([1, 2, 3]);

    // 5. Object.create(null) — dùng trong vài lib làm dictionary
    const dict = Object.create(null) as Record<string, number>;
    dict.x = 1;
    expect(dict.x).toBe(1);
  });
});
