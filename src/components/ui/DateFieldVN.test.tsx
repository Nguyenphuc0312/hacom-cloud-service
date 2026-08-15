import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderHook, act } from "@testing-library/react";
import {
  isValidIsoDate,
  isoToVn,
  normalizeVnDateInput,
  useIsoDateField,
  vnToIso,
} from "./DateFieldVN";

describe("isValidIsoDate", () => {
  it("chấp nhận ngày có thật", () => {
    expect(isValidIsoDate("2026-08-14")).toBe(true);
    expect(isValidIsoDate("2024-02-29")).toBe(true); // năm nhuận
    expect(isValidIsoDate("2000-02-29")).toBe(true); // chia hết 400
  });

  it("loại ngày không tồn tại thay vì để Date tự cuộn tháng", () => {
    expect(isValidIsoDate("2026-04-31")).toBe(false); // tháng 4 chỉ có 30
    expect(isValidIsoDate("2025-02-29")).toBe(false); // 2025 không nhuận
    expect(isValidIsoDate("1900-02-29")).toBe(false); // chia hết 100, không 400
    expect(isValidIsoDate("2026-13-01")).toBe(false);
    expect(isValidIsoDate("2026-00-10")).toBe(false);
    expect(isValidIsoDate("2026-08-00")).toBe(false);
  });

  it("loại chuỗi sai định dạng", () => {
    expect(isValidIsoDate("14/08/2026")).toBe(false);
    expect(isValidIsoDate("2026-8-14")).toBe(false);
    expect(isValidIsoDate("")).toBe(false);
  });
});

describe("normalizeVnDateInput", () => {
  it("tự chèn dấu / theo mặt nạ dd/mm/yyyy", () => {
    expect(normalizeVnDateInput("14")).toBe("14");
    expect(normalizeVnDateInput("1408")).toBe("14/08");
    expect(normalizeVnDateInput("14082026")).toBe("14/08/2026");
  });

  it("gộp mọi kiểu phân cách khi dán về cùng một dạng", () => {
    expect(normalizeVnDateInput("14-08-2026")).toBe("14/08/2026");
    expect(normalizeVnDateInput("14.08.2026")).toBe("14/08/2026");
  });

  it("cắt phần thừa quá 8 chữ số", () => {
    expect(normalizeVnDateInput("140820261234")).toBe("14/08/2026");
  });
});

describe("vnToIso / isoToVn", () => {
  it("chuyển đổi hai chiều với ngày hợp lệ", () => {
    expect(vnToIso("14/08/2026")).toBe("2026-08-14");
    expect(isoToVn("2026-08-14")).toBe("14/08/2026");
    expect(vnToIso(" 29/02/2024 ")).toBe("2024-02-29"); // có trim
  });

  it("trả rỗng với ngày không tồn tại", () => {
    expect(vnToIso("31/04/2026")).toBe("");
    expect(vnToIso("29/02/2025")).toBe("");
    expect(isoToVn("2026-04-31")).toBe("");
  });
});

describe("useIsoDateField", () => {
  it("giữ chuỗi đang gõ dở và xoá ISO cho tới khi ngày hợp lệ", () => {
    const onIsoChange = vi.fn();
    const { result } = renderHook(() => useIsoDateField("", onIsoChange));

    act(() => result.current.onChange("14"));
    expect(result.current.value).toBe("14");
    expect(onIsoChange).toHaveBeenLastCalledWith("");

    act(() => result.current.onChange("14082026"));
    expect(onIsoChange).toHaveBeenLastCalledWith("2026-08-14");
  });

  it("xoá ISO nền khi ngày đang gõ không còn hợp lệ", () => {
    const onIsoChange = vi.fn();
    const { result } = renderHook(() =>
      useIsoDateField("2026-08-14", onIsoChange),
    );

    // Sửa thành ngày không tồn tại: API không được nhận ngày cũ nữa.
    act(() => result.current.onChange("31/04/2026"));
    expect(onIsoChange).toHaveBeenLastCalledWith("");
    expect(result.current.value).toBe("31/04/2026");
  });

  /**
   * Chốt lại bug đã gặp: màn nào KẸP giá trị trong callback (DepartmentSelector
   * ép `endDate` về `startDate` khi nhận chuỗi rỗng) thì ISO dội về khác cái vừa
   * gửi đi. Nếu hook so khớp giá trị để nhận diện "thay đổi từ bên ngoài", nháp
   * bị xoá và ô nhảy về ngày cũ ngay ở chữ số đầu tiên.
   */
  it("giữ nháp kể cả khi consumer kẹp ISO sang giá trị khác", () => {
    const START = "2026-08-01";
    const { result } = renderHook(() => {
      const [endDate, setEndDate] = React.useState("2026-08-20");
      const field = useIsoDateField(endDate, (iso) =>
        setEndDate(iso < START ? START : iso),
      );
      return { endDate, field };
    });

    act(() => result.current.field.onChange("1"));

    expect(result.current.field.value).toBe("1");
    expect(result.current.endDate).toBe(START);
  });

  it("reset() bỏ được nháp hỏng khi mở lại đúng ngày cũ", () => {
    const { result } = renderHook(() => useIsoDateField("2026-08-14", () => {}));

    act(() => result.current.onChange("31/04/2026"));
    expect(result.current.value).toBe("31/04/2026");

    // `iso` không đổi nên effect không chạy — modal phải tự gọi reset().
    act(() => result.current.reset());
    expect(result.current.value).toBe("14/08/2026");
  });

  it("bỏ nháp khi dữ liệu được nạp lại từ bên ngoài", () => {
    const { result, rerender } = renderHook(
      ({ iso }) => useIsoDateField(iso, () => {}),
      { initialProps: { iso: "" } },
    );

    act(() => result.current.onChange("14"));
    expect(result.current.value).toBe("14");

    // Form mở lại với dữ liệu khác → phải hiển thị ngày mới, không giữ nháp cũ.
    rerender({ iso: "2026-12-25" });
    expect(result.current.value).toBe("25/12/2026");
  });
});
