import { describe, expect, it } from "vitest";
import { pickUniqueUserIdByName } from "./pickUniqueUserIdByName";

describe("pickUniqueUserIdByName", () => {
  it("nhận khi đúng 1 người khớp tên", () => {
    const users = [
      { id: "u1", fullName: "Đậu Cao Minh Nhật" },
      { id: "u2", fullName: "Vũ Minh Quốc" },
    ];
    expect(pickUniqueUserIdByName(users, "Đậu Cao Minh Nhật")).toBe("u1");
  });

  it("bỏ qua khi trùng tên nhiều người — thà không có avatar còn hơn sai mặt", () => {
    const users = [
      { id: "u1", fullName: "Nguyễn Văn A" },
      { id: "u2", fullName: "Nguyễn Văn A" },
    ];
    expect(pickUniqueUserIdByName(users, "Nguyễn Văn A")).toBeNull();
  });

  it("gom theo id: cùng người khớp cả fullName lẫn displayName vẫn nhận", () => {
    const users = [{ id: "u1", fullName: "Trần Vũ Đại", displayName: "Trần Vũ Đại" }];
    expect(pickUniqueUserIdByName(users, "Trần Vũ Đại")).toBe("u1");
  });

  it("khớp không phân biệt hoa thường và khoảng trắng thừa", () => {
    const users = [{ id: "u1", fullName: "  Trần Đăng Công " }];
    expect(pickUniqueUserIdByName(users, "trần đăng công")).toBe("u1");
  });

  it("không khớp một phần — chỉ nhận tên đầy đủ chính xác", () => {
    const users = [{ id: "u1", fullName: "Nguyễn Thế Huy Hoàng" }];
    expect(pickUniqueUserIdByName(users, "Huy Hoàng")).toBeNull();
  });

  it("tên rỗng hoặc không ai khớp → null", () => {
    const users = [{ id: "u1", fullName: "Vũ Minh Quốc" }];
    expect(pickUniqueUserIdByName(users, "   ")).toBeNull();
    expect(pickUniqueUserIdByName(users, "Người Lạ")).toBeNull();
    expect(pickUniqueUserIdByName([], "Vũ Minh Quốc")).toBeNull();
  });
});
