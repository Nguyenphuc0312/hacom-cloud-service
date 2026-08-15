import React, { useRef } from "react";
import clsx from "clsx";
import { Calendar as CalendarIcon } from "lucide-react";

/**
 * Ô ngày CỨNG dd/mm/yyyy.
 *
 * `<input type="date">` native hiển thị theo cài đặt vùng của máy, nên máy đặt
 * US ra "08/10/2026" kiểu mm/dd — người Việt đọc thành 8 tháng 10. Ở đây ô nhìn
 * thấy là text dd/mm/yyyy, còn native input bị ẩn và chỉ dùng để mở lịch.
 *
 * Giá trị vào/ra luôn là dd/mm/yyyy; dùng `vnToIso`/`isoToVn` khi cần bắc cầu
 * sang API dạng ISO.
 */

const isLeapYear = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

const daysInMonth = (year: number, month: number): number => {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
};

/** Kiểm tra ngày ISO thực sự tồn tại, không để Date tự cuộn 31/04 sang tháng 5. */
export function isValidIsoDate(iso: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

/**
 * Chuẩn hoá thao tác gõ/dán về mặt nạ dd/mm/yyyy. Ví dụ: `14082026`,
 * `14-08-2026` và `14.08.2026` đều trở thành `14/08/2026`.
 *
 * Giá trị chưa đủ vẫn được giữ để người dùng gõ tiếp; việc xác thực chỉ xảy ra
 * qua `vnToIso` khi đã đủ ngày/tháng/năm.
 */
export function normalizeVnDateInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** "dd/mm/yyyy" (hợp lệ) → "yyyy-mm-dd" cho native picker; sai/rỗng → "". */
export function vnToIso(vn: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(vn.trim());
  if (!match) return "";
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  return isValidIsoDate(iso) ? iso : "";
}

/** "yyyy-mm-dd" (từ native picker hoặc API) → "dd/mm/yyyy". */
export function isoToVn(iso: string): string {
  if (!isValidIsoDate(iso)) return "";
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

/**
 * Bọc một ô ngày mà STATE giữ ISO ("yyyy-mm-dd") nhưng hiển thị dd/mm/yyyy.
 * Chuỗi đang gõ dở được giữ tại UI, nhưng ISO nền bị xoá ngay khi ngày không
 * còn hợp lệ — tránh người dùng thấy ngày mới trong khi API vẫn nhận ngày cũ.
 */
export function useIsoDateField(iso: string, onIsoChange: (iso: string) => void) {
  const [draft, setDraft] = React.useState<string | null>(null);
  const previousIsoRef = useRef(iso);
  const isTypingRef = useRef(false);

  // Khi form được nạp lại/đổi dữ liệu từ bên ngoài, bỏ nháp cũ.
  //
  // Cờ "đang gõ" chứ KHÔNG so khớp giá trị ISO vừa gửi đi: nhiều màn kẹp lại giá
  // trị trong callback (DepartmentSelector ép `endDate` về `startDate` khi nhận
  // chuỗi rỗng), nên ISO dội về khác hẳn cái mình vừa gửi. So khớp giá trị sẽ
  // coi đó là thay đổi từ bên ngoài, xoá nháp, và ô nhảy về ngày cũ ngay khi
  // người dùng mới gõ chữ số đầu tiên.
  React.useEffect(() => {
    if (previousIsoRef.current === iso) return;
    previousIsoRef.current = iso;
    if (isTypingRef.current) {
      isTypingRef.current = false;
      return;
    }
    setDraft(null);
  }, [iso]);

  /**
   * Bỏ nháp thủ công. Cần khi form mở lại với ĐÚNG ngày cũ: `iso` không đổi nên
   * effect ở trên không chạy, và nháp hỏng của lần mở trước ("31/04/2026") sẽ
   * còn nguyên trên màn hình.
   *
   * Bọc useCallback để caller đưa thẳng vào deps của effect được.
   */
  const reset = React.useCallback(() => setDraft(null), []);

  return {
    value: draft ?? isoToVn(iso),
    reset,
    onChange: (value: string) => {
      const vn = normalizeVnDateInput(value);
      const next = vnToIso(vn);
      setDraft(next ? null : vn);
      isTypingRef.current = true;
      // `""` là giá trị có chủ đích: không để ISO trước đó bị gửi nhầm khi
      // người dùng đang sửa/dán một ngày chưa hợp lệ.
      onIsoChange(next);
      // Callback có thể chạy đồng bộ mà không đổi ISO (vd kẹp về đúng giá trị
      // cũ) — khi đó effect không chạy, phải tự hạ cờ để lần nạp dữ liệu từ
      // bên ngoài sau đó vẫn xoá được nháp.
      if (previousIsoRef.current === next) isTypingRef.current = false;
    },
  };
}

export const DateFieldVN: React.FC<{
  value: string;
  onChange: (vn: string) => void;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
  wrapClassName?: string;
}> = ({ value, onChange, disabled, ariaLabel, className, wrapClassName }) => {
  const pickerRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const el = pickerRef.current;
    if (!el || disabled) return;
    // showPicker() mở lịch mà không cần input hiện hữu; fallback focus.
    if (typeof el.showPicker === "function") el.showPicker();
    else el.focus();
  };

  return (
    <div className={clsx("relative flex items-center", wrapClassName)}>
      <input
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/yyyy"
        value={value}
        onChange={(e) => onChange(normalizeVnDateInput(e.target.value))}
        disabled={disabled}
        aria-label={ariaLabel}
        maxLength={10}
        autoComplete="off"
        className={className}
      />
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        title="Chọn từ lịch"
        aria-label="Chọn ngày từ lịch"
        className="shrink-0 rounded p-1 text-[#64748b] transition-colors hover:bg-[#1976D2]/10 hover:text-[#1565C0] disabled:opacity-50"
      >
        <CalendarIcon size={15} />
      </button>
      {/* Native input ẩn — chỉ để mở picker; đồng bộ 2 chiều với ô text. */}
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={vnToIso(value)}
        onChange={(e) => onChange(isoToVn(e.target.value))}
        className="pointer-events-none absolute h-0 w-0 opacity-0"
      />
    </div>
  );
};

export default DateFieldVN;
