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

/** "dd/mm/yyyy" (hợp lệ) → "yyyy-mm-dd" cho native picker; sai/rỗng → "". */
export function vnToIso(vn: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(vn.trim());
  if (!m) return "";
  const [, d, mo, y] = m;
  const iso = `${y}-${mo}-${d}`;
  const dt = new Date(`${iso}T00:00:00`);
  // Chặn ngày không tồn tại (32/13/…): Date sẽ cuộn tháng nên phải đối chiếu lại.
  if (Number.isNaN(dt.getTime())) return "";
  const back = `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
  return back === vn.trim() ? iso : "";
}

/** "yyyy-mm-dd" (từ native picker hoặc API) → "dd/mm/yyyy". */
export function isoToVn(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/**
 * Bọc một ô ngày mà STATE giữ ISO ("yyyy-mm-dd") nhưng hiển thị dd/mm/yyyy.
 * Giữ nguyên chuỗi đang gõ dở để người dùng gõ tay được, và chỉ đẩy lên state
 * khi ngày đã hợp lệ.
 */
export function useIsoDateField(iso: string, onIsoChange: (iso: string) => void) {
  const [draft, setDraft] = React.useState<string | null>(null);
  return {
    value: draft ?? isoToVn(iso),
    onChange: (vn: string) => {
      const next = vnToIso(vn);
      setDraft(next ? null : vn);
      if (next) onIsoChange(next);
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
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={ariaLabel}
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
