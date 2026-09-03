import React, { useRef } from "react";
import clsx from "clsx";
import { Calendar as CalendarIcon } from "lucide-react";
import { isoToVn, normalizeVnDateInput, vnToIso } from "./dateFieldVNUtils";

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
