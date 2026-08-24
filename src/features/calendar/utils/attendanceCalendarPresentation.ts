type AttendanceCalendarPresentation = {
  displaySymbol?: string | null;
  shiftCode?: string | null;
};

/** Mã ca thắng ký hiệu công nội bộ +/-; phép/nghỉ vẫn giữ mã nghiệp vụ. */
export function attendanceCalendarLabel(
  attendance: AttendanceCalendarPresentation | null | undefined,
): string {
  const symbol = attendance?.displaySymbol?.trim() ?? "";
  const businessLabel = symbol
    .split(";")
    .map((token) => token.trim())
    .filter((token) => token && token !== "+" && token !== "-")
    .join(";");
  if (businessLabel) return businessLabel;
  return attendance?.shiftCode?.trim() ?? "";
}
