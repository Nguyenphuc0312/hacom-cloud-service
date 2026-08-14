import React from "react";

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);
const YEARS = Array.from({ length: 101 }, (_, index) => 2000 + index);

type TimesheetPeriodPickerProps = {
  month: number;
  year: number;
  onMonthChange: (month: number) => void;
  onYearChange: (year: number) => void;
};

/**
 * Bộ chọn kỳ công không dùng `<input type="month">`: control native hiển thị
 * theo locale máy (ví dụ US), nên không giữ được chuẩn giao diện HRM Việt Nam.
 */
export const TimesheetPeriodPicker: React.FC<TimesheetPeriodPickerProps> = ({
  month,
  year,
  onMonthChange,
  onYearChange,
}) => (
  <div className="flex items-end gap-2">
    <label className="grid gap-1 text-xs font-medium text-[#475569]">
      <span>Tháng</span>
      <select
        aria-label="Tháng"
        value={month}
        onChange={(event) => onMonthChange(Number(event.currentTarget.value))}
        className="h-10 min-w-28 rounded-lg border border-[#d7dce3] bg-white px-3 text-sm text-[#0f172a] outline-none focus:border-[#1976D2]"
      >
        {MONTHS.map((value) => (
          <option key={value} value={value}>
            Tháng {String(value).padStart(2, "0")}
          </option>
        ))}
      </select>
    </label>
    <label className="grid gap-1 text-xs font-medium text-[#475569]">
      <span>Năm</span>
      <select
        aria-label="Năm"
        value={year}
        onChange={(event) => onYearChange(Number(event.currentTarget.value))}
        className="h-10 min-w-24 rounded-lg border border-[#d7dce3] bg-white px-3 text-sm text-[#0f172a] outline-none focus:border-[#1976D2]"
      >
        {YEARS.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
    </label>
  </div>
);
