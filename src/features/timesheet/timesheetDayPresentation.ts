import type { MyTimesheetDay } from "../api/hrApi";

export interface TimesheetDayScheduleNotice {
  label: string;
  detail: string;
}

/**
 * `UNASSIGNED` is emitted by HRM when an employee has no effective shift
 * assignment. It must be presented as a scheduling action for HR, never as an
 * absence or a zero-work-day judgement by the chat client.
 */
export const getTimesheetDayScheduleNotice = (
  source: MyTimesheetDay["source"],
): TimesheetDayScheduleNotice | null => {
  if (source !== "UNASSIGNED") return null;

  return {
    label: "Chưa phân ca",
    detail: "Chưa tính công — cần HR thiết lập lịch làm việc.",
  };
};
