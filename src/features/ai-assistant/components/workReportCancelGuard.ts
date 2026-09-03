import type { WorkReportAttachment } from "../types";

/**
 * Điều kiện hỏi lại trước khi HỦY biểu mẫu báo cáo công việc.
 *
 * Tách khỏi `WorkReportForm.tsx` vì file đó chỉ được export component (quy tắc
 * `react-refresh/only-export-components`), và để test được mà không phải dựng
 * cả form.
 */

/** Phần dữ liệu một dòng việc mà người dùng có thể nhập (subset của `TaskRow`). */
export interface TaskRowInput {
  task_name: string;
  completion_date?: string;
  requirements: string;
  completed: string;
  difficulties: string;
  proposals: string;
  notes?: string;
  attachments: WorkReportAttachment[];
}

/**
 * Dòng việc này có gì đáng mất không (người dùng đã gõ/đính gì vào chưa).
 *
 * Bug đã gặp: nút "Hủy" chỉ hỏi khi `autoSavedTaskIds` khác rỗng — tức CHỈ khi
 * đã đính kèm tệp. Gõ đầy một bảng công việc mà không đính tệp thì bấm Hủy là
 * mất trắng, không một câu hỏi; trong khi nút "Gửi báo cáo" (hoàn tác được bằng
 * cách xóa) lại có hộp xác nhận. Đúng chiều ngược lại.
 */
export function taskRowHasInput(task: TaskRowInput): boolean {
  return Boolean(
    task.task_name.trim() ||
      task.requirements.trim() ||
      task.completed.trim() ||
      task.difficulties.trim() ||
      task.proposals.trim() ||
      task.notes?.trim() ||
      task.completion_date ||
      task.attachments.length > 0,
  );
}
