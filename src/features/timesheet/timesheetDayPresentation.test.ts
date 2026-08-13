import { describe, expect, it } from "vitest";
import { getTimesheetDayScheduleNotice } from "./timesheetDayPresentation";

describe("getTimesheetDayScheduleNotice", () => {
  it("marks an unassigned schedule as an HR scheduling state, not absence", () => {
    expect(getTimesheetDayScheduleNotice("UNASSIGNED")).toEqual({
      label: "Chưa phân ca",
      detail: "Chưa tính công — cần HR thiết lập lịch làm việc.",
    });
  });

  it("does not add the notice for assigned or legacy days", () => {
    expect(getTimesheetDayScheduleNotice("ASSIGNMENT_EMPLOYEE")).toBeNull();
    expect(getTimesheetDayScheduleNotice(null)).toBeNull();
    expect(getTimesheetDayScheduleNotice(undefined)).toBeNull();
  });
});
