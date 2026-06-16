/**
 * PersonalEventFormModal — form thêm/sửa "lịch cá nhân" (đơn giản hơn lịch họp).
 * Chỉ gồm: nội dung, ngày, giờ bắt đầu/kết thúc, ghi chú.
 */

import React from "react";
import clsx from "clsx";
import { Modal } from "./Modal";
import { Button } from "./Button";

export interface PersonalEventFormData {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string;
  notes: string;
  /** Quyền xem: "private" = chỉ hiện "Bận" cho người khác (BUSY_ONLY);
   *  "public" = ai cũng xem được đầy đủ (PUBLIC). Mặc định "private". */
  visibility: "private" | "public";
}

interface PersonalEventFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Nếu có → nút "Hủy" quay lại bước chọn loại lịch thay vì đóng hẳn. */
  onBack?: () => void;
  onSave: (data: PersonalEventFormData) => Promise<void> | void;
  defaultDate?: string;
  defaultStartTime?: string;
  defaultEndTime?: string;
  /** Nếu có → chế độ chỉnh sửa (giữ id). */
  initialData?: PersonalEventFormData | null;
  isLoading?: boolean;
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const formatDateVN = (iso: string): string => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
};

const WEEKDAY_VN = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
const formatWeekdayVN = (iso: string): string => {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return WEEKDAY_VN[d.getDay()];
};

const formatDuration = (start: string, end: string): string => {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return "";
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff <= 0) return "";
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  if (h === 0) return `${m} phút`;
  if (m === 0) return `${h} giờ`;
  return `${h} giờ ${m} phút`;
};

export const PersonalEventFormModal: React.FC<PersonalEventFormModalProps> = ({
  isOpen,
  onClose,
  onBack,
  onSave,
  defaultDate,
  defaultStartTime,
  defaultEndTime,
  initialData = null,
  isLoading = false,
}) => {
  const isEditMode = !!initialData;
  const [title, setTitle] = React.useState("");
  const [date, setDate] = React.useState(defaultDate ?? today());
  const [dateText, setDateText] = React.useState(formatDateVN(defaultDate ?? today()));
  const [startTime, setStartTime] = React.useState("08:00");
  const [endTime, setEndTime] = React.useState("09:00");
  const [notes, setNotes] = React.useState("");
  const [visibility, setVisibility] = React.useState<"private" | "public">("private");
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // Reset / pre-fill khi mở modal
  React.useEffect(() => {
    if (!isOpen) return;
    if (initialData) {
      setTitle(initialData.title);
      setDate(initialData.date);
      setDateText(formatDateVN(initialData.date));
      setStartTime(initialData.startTime);
      setEndTime(initialData.endTime);
      setNotes(initialData.notes);
      setVisibility(initialData.visibility ?? "private");
      setErrors({});
    } else {
      const d0 = defaultDate ?? today();
      setTitle("");
      setDate(d0);
      setDateText(formatDateVN(d0));
      setStartTime(defaultStartTime ?? "08:00");
      setEndTime(defaultEndTime ?? "09:00");
      setNotes("");
      setVisibility("private");
      setErrors({});
    }
  }, [isOpen, defaultDate, defaultStartTime, defaultEndTime, initialData]);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = "Vui lòng nhập nội dung";
    if (!date) errs.date = "Vui lòng chọn ngày";
    if (!startTime) errs.startTime = "Vui lòng chọn giờ bắt đầu";
    if (!endTime) errs.endTime = "Vui lòng chọn giờ kết thúc";
    if (startTime && endTime && startTime >= endTime) errs.endTime = "Giờ kết thúc phải sau giờ bắt đầu";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    const data: PersonalEventFormData = {
      id: initialData?.id ?? `personal-${Date.now()}`,
      title: title.trim(),
      date,
      startTime,
      endTime,
      notes: notes.trim(),
      visibility,
    };
    onClose();
    try {
      await onSave(data);
    } catch {
      // Error handled by parent
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditMode ? "Chỉnh sửa lịch cá nhân" : "Thêm lịch cá nhân"}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="brand-outline" onClick={onBack ?? onClose} type="button">
            {onBack ? "Quay lại" : "Hủy"}
          </Button>
          <Button variant="brand" onClick={handleSave} type="button" disabled={isLoading}>
            {isLoading ? "Đang lưu..." : isEditMode ? "Cập nhật" : "Lưu"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Nội dung */}
        <div>
          <label className="mb-1 block text-sm font-medium text-text-primary">
            Nội dung <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="VD: Khám sức khỏe định kỳ"
            className={clsx(
              "w-full rounded-lg border bg-surface-overlay px-3 py-2 text-sm text-text-primary placeholder:text-text-muted",
              "focus:outline-none focus:ring-2 focus:ring-[#1976D2]/15",
              errors.title ? "border-danger" : "border-border",
            )}
          />
          {errors.title && <p className="mt-1 text-xs text-danger">{errors.title}</p>}
        </div>

        {/* Thời gian */}
        <div>
          <label className="mb-1 block text-sm font-medium text-text-primary">
            Thời gian <span className="text-danger">*</span>
            <span className="ml-2 text-[11px] font-normal text-text-muted">
              (định dạng 24h — giờ địa phương)
            </span>
          </label>

          {/* Ngày */}
          <div className="mb-2">
            <span className="mb-1 flex items-center justify-between text-xs font-medium text-text-secondary">
              <span>Ngày</span>
              {date && (
                <span className="rounded-md bg-teal-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-teal-700 dark:text-teal-300">
                  {formatWeekdayVN(date)}, {formatDateVN(date)}
                </span>
              )}
            </span>
            <div
              className={clsx(
                "flex items-center gap-1 rounded-lg border bg-surface-overlay px-2 py-1.5",
                "focus-within:ring-2 focus-within:ring-[#1976D2]/15",
                errors.date ? "border-danger" : "border-border",
              )}
            >
              <input
                type="text"
                inputMode="numeric"
                value={dateText}
                onChange={(e) => {
                  const raw = e.target.value;
                  const digits = raw.replace(/\D/g, "").slice(0, 8);
                  let formatted = digits;
                  if (digits.length > 4) {
                    formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
                  } else if (digits.length > 2) {
                    formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
                  }
                  setDateText(formatted);
                  if (digits.length === 8) {
                    const dd = digits.slice(0, 2);
                    const mm = digits.slice(2, 4);
                    const yyyy = digits.slice(4, 8);
                    setDate(`${yyyy}-${mm}-${dd}`);
                  }
                }}
                onBlur={() => {
                  if (date) setDateText(formatDateVN(date));
                }}
                placeholder="dd/mm/yyyy"
                aria-label="Ngày"
                className="flex-1 bg-transparent px-1 font-mono text-sm tabular-nums text-text-primary placeholder:text-text-muted focus:outline-none"
              />
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setDateText(formatDateVN(e.target.value));
                }}
                aria-label="Chọn ngày từ lịch"
                className="ml-auto w-7 cursor-pointer bg-transparent text-text-secondary focus:outline-none [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-datetime-edit]:hidden"
              />
            </div>
            <p className="mt-1 text-[11px] text-text-muted">Tự gõ dd/mm/yyyy hoặc bấm icon lịch để chọn.</p>
          </div>

          {/* Bắt đầu / Kết thúc */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="mb-1 flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Bắt đầu
              </span>
              <input
                type="time"
                value={startTime}
                step={300}
                onChange={(e) => setStartTime(e.target.value)}
                className={clsx(
                  "w-full rounded-lg border bg-surface-overlay px-3 py-2 text-sm font-mono text-text-primary tabular-nums",
                  "focus:outline-none focus:ring-2 focus:ring-[#1976D2]/15",
                  errors.startTime ? "border-danger" : "border-border",
                )}
              />
            </div>
            <div>
              <span className="mb-1 flex items-center gap-1 text-xs font-medium text-rose-700 dark:text-rose-300">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                Kết thúc
              </span>
              <input
                type="time"
                value={endTime}
                step={300}
                onChange={(e) => setEndTime(e.target.value)}
                className={clsx(
                  "w-full rounded-lg border bg-surface-overlay px-3 py-2 text-sm font-mono text-text-primary tabular-nums",
                  "focus:outline-none focus:ring-2 focus:ring-[#1976D2]/15",
                  errors.endTime ? "border-danger" : "border-border",
                )}
              />
            </div>
          </div>

          {startTime && endTime && startTime < endTime && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-teal-500/10 px-2 py-1 text-xs font-medium text-teal-700 dark:text-teal-300">
              <span className="font-mono tabular-nums">
                {startTime} — {endTime}
              </span>
              <span className="text-text-muted">·</span>
              <span>Thời lượng: {formatDuration(startTime, endTime)}</span>
            </p>
          )}

          {(errors.date || errors.startTime || errors.endTime) && (
            <p className="mt-1 text-xs text-danger">
              {errors.date ?? errors.startTime ?? errors.endTime}
            </p>
          )}
        </div>

        {/* Ghi chú */}
        <div>
          <label className="mb-1 block text-sm font-medium text-text-primary">Ghi chú</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Thêm ghi chú (nếu có)..."
            rows={3}
            className="w-full resize-none rounded-lg border border-border bg-surface-overlay px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-[#1976D2]/15"
          />
        </div>

        {/* Quyền xem (riêng tư / công khai) */}
        <div>
          <label className="mb-1 block text-sm font-medium text-text-primary">Quyền xem</label>
          <div className="flex gap-2">
            {(["private", "public"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVisibility(v)}
                className={clsx(
                  "flex-1 rounded-lg border px-4 py-1.5 text-sm font-medium transition-micro",
                  visibility === v
                    ? "border-[#1976D2]/60 bg-[#1976D2]/10 text-[#1565C0]"
                    : "border-border bg-surface-overlay text-text-secondary hover:bg-surface-hover",
                )}
              >
                {v === "private" ? "Riêng tư" : "Công khai"}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-text-muted">
            {visibility === "private"
              ? "Riêng tư: người khác xem lịch của bạn chỉ thấy ô “Bận”, không thấy nội dung."
              : "Công khai: ai xem lịch của bạn cũng thấy đầy đủ chi tiết sự kiện."}
          </p>
        </div>
      </div>
    </Modal>
  );
};

export default PersonalEventFormModal;
