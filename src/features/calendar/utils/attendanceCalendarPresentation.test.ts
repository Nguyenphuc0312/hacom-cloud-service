import { describe, expect, it } from "vitest";

import { attendanceCalendarLabel } from "./attendanceCalendarPresentation";

describe("attendanceCalendarLabel", () => {
  it.each(["+", "-"])("hiện mã ca thay cho ký hiệu %s", (displaySymbol) => {
    expect(attendanceCalendarLabel({ displaySymbol, shiftCode: "HC1" })).toBe(
      "HC1",
    );
  });

  it("removes internal work tokens from composite leave labels", () => {
    expect(
      attendanceCalendarLabel({ displaySymbol: "P;-", shiftCode: "HC1" }),
    ).toBe("P");
  });

  it("giữ mã phép/nghỉ thay vì che bằng mã ca", () => {
    expect(
      attendanceCalendarLabel({ displaySymbol: "P", shiftCode: "HC1" }),
    ).toBe("P");
  });

  it("hiện ca đã phân dù ngày chưa có ký hiệu công", () => {
    expect(
      attendanceCalendarLabel({ displaySymbol: "", shiftCode: "VH1" }),
    ).toBe("VH1");
  });
  it("chuẩn hóa ký hiệu lễ cũ theo mã HRM hiện hành", () => {
    expect(attendanceCalendarLabel({ displaySymbol: "L1" })).toBe("L");
  });
});
