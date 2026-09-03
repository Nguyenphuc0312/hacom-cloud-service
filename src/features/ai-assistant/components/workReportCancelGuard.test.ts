import { describe, expect, it } from "vitest";
import { taskRowHasInput, type TaskRowInput } from "./workReportCancelGuard";

/**
 * Nút "Hủy" của biểu mẫu báo cáo công việc phải hỏi lại trước khi bỏ dữ liệu.
 *
 * Bug đã gặp: điều kiện hỏi là `autoSavedTaskIds.size > 0` — tức CHỈ hỏi khi đã
 * đính kèm tệp (việc được tự lưu nháp để có chỗ gắn file). Người dùng gõ đầy
 * một bảng công việc mà không đính tệp thì bấm Hủy là mất trắng, không một câu
 * hỏi — trong khi nút "Gửi báo cáo" (thao tác HOÀN TÁC ĐƯỢC bằng cách xóa) lại
 * có hộp xác nhận. Đúng chiều ngược lại.
 */
const emptyTask = (): TaskRowInput => ({
  task_name: "",
  completion_date: "",
  requirements: "",
  completed: "",
  difficulties: "",
  proposals: "",
  notes: "",
  attachments: [],
});

describe("taskRowHasInput", () => {
  it("dòng trống → không có gì để mất, Hủy đóng luôn không hỏi", () => {
    expect(taskRowHasInput(emptyTask())).toBe(false);
  });

  it("chỉ toàn khoảng trắng cũng coi là trống", () => {
    expect(
      taskRowHasInput({ ...emptyTask(), task_name: "   ", completed: "\n\t " }),
    ).toBe(false);
  });

  it.each([
    ["task_name", "Làm báo cáo tuần"],
    ["requirements", "Xong trước thứ 6"],
    ["completed", "Đã xong 80%"],
    ["difficulties", "Thiếu số liệu"],
    ["proposals", "Xin thêm người"],
    ["notes", "Ghi chú thêm"],
  ] as const)("gõ vào '%s' → PHẢI hỏi trước khi hủy", (field, value) => {
    expect(taskRowHasInput({ ...emptyTask(), [field]: value })).toBe(true);
  });

  it("chỉ chọn ngày hoàn thành cũng là dữ liệu đã nhập", () => {
    expect(taskRowHasInput({ ...emptyTask(), completion_date: "2026-08-07" })).toBe(true);
  });

  it("có tệp đính kèm → PHẢI hỏi (tệp đã lên BE, hủy là xóa thật)", () => {
    expect(
      taskRowHasInput({
        ...emptyTask(),
        attachments: [
          { id: 1, filename: "bao-cao.xlsx" } as TaskRowInput["attachments"][number],
        ],
      }),
    ).toBe(true);
  });
});
