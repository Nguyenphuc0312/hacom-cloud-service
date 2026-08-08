import React from "react";
import ReactDOM from "react-dom";
import { useClickOutside } from "../../../hooks";
import {
  XMarkIcon,
  BellIcon,
  ChevronDownIcon,
  CalendarDaysIcon,
} from "@heroicons/react/24/outline";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/solid";
import { Modal } from "../../../components/ui";
import clsx from "clsx";

export type RepeatType = "none" | "daily" | "weekly" | "monthly";

export interface ReminderCreatePayload {
  content: string;
  /** Local Date of when to remind */
  reminderDate: Date;
  repeatType: RepeatType;
}

interface ReminderCreateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: ReminderCreatePayload) => void;
  /** Pre-fill content (e.g. from a forwarded message) */
  initialContent?: string;
  /** Edit mode: seed the form with an existing reminder + change labels */
  mode?: "create" | "edit";
  initialDate?: Date;
  initialRepeat?: RepeatType;
}

type QuickTime = "15min" | "30min" | "tomorrow9am" | "custom";

const REPEAT_OPTIONS: { value: RepeatType; label: string }[] = [
  { value: "none", label: "Không lặp lại" },
  { value: "daily", label: "Lặp lại hàng ngày" },
  { value: "weekly", label: "Lặp lại hàng tuần" },
  { value: "monthly", label: "Lặp lại hàng tháng" },
];

const pad = (n: number) => String(n).padStart(2, "0");

const getQuickDate = (qt: Exclude<QuickTime, "custom">): Date => {
  const d = new Date();
  if (qt === "15min") {
    d.setMinutes(d.getMinutes() + 15, 0, 0);
    return d;
  }
  if (qt === "30min") {
    d.setMinutes(d.getMinutes() + 30, 0, 0);
    return d;
  }
  // tomorrow9am
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
};

const getQuickLabel = (qt: Exclude<QuickTime, "custom">): string => {
  if (qt === "15min") return "15 phút nữa";
  if (qt === "30min") return "30 phút nữa";
  return "9:00 ngày mai";
};

/* ─────────────────────────────────────────────────────────────
 * Date-time picker (calendar popover) — Zalo "Chọn ngày nhắc hẹn"
 * Mirrors PollCreateDialog's DeadlinePicker so both dialogs feel identical.
 * ───────────────────────────────────────────────────────────── */
const WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const MONTHS = [
  "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6",
  "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12",
];

const DateTimePicker: React.FC<{
  value: Date | null;
  onChange: (d: Date | null) => void;
  /** Text shown when nothing is picked */
  emptyLabel: string;
}> = ({ value, onChange, emptyLabel }) => {
  const [open, setOpen] = React.useState(false);
  const [viewMonth, setViewMonth] = React.useState(() => {
    const base = value ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const [dateText, setDateText] = React.useState(
    value ? `${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${value.getFullYear()}` : "",
  );
  const [timeText, setTimeText] = React.useState(
    value ? `${pad(value.getHours())}:${pad(value.getMinutes())}` : "",
  );
  const [draftDay, setDraftDay] = React.useState<Date | null>(value);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const popRef = React.useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = React.useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // Sync internal draft when the external value changes (quick-chip selection)
  const [prevValue, setPrevValue] = React.useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setDraftDay(value);
    if (value) {
      setViewMonth(new Date(value.getFullYear(), value.getMonth(), 1));
      setDateText(`${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${value.getFullYear()}`);
      setTimeText(`${pad(value.getHours())}:${pad(value.getMinutes())}`);
    }
  }

  React.useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const update = () => {
      const r = triggerRef.current!.getBoundingClientRect();
      const POP_W = 288;
      const POP_H = 420;
      let left = r.left;
      let top = r.bottom + 6;
      if (left + POP_W > window.innerWidth - 8) left = window.innerWidth - POP_W - 8;
      if (top + POP_H > window.innerHeight - 8) top = Math.max(8, r.top - POP_H - 6);
      setCoords({ top, left });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  useClickOutside([ref, popRef], () => setOpen(false), { active: open });

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();

  const cells: { day: number; current: boolean; date: Date }[] = [];
  for (let i = 0; i < firstWeekday; i++) {
    const day = daysInPrev - firstWeekday + 1 + i;
    cells.push({ day, current: false, date: new Date(year, month - 1, day) });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, current: true, date: new Date(year, month, d) });
  }
  let next = 1;
  while (cells.length < 42) {
    cells.push({ day: next, current: false, date: new Date(year, month + 1, next) });
    next++;
  }

  const today = new Date();
  const isSameDay = (a: Date, b: Date | null) =>
    !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const pickDay = (date: Date) => {
    setDraftDay(date);
    setDateText(`${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`);
    if (!timeText) setTimeText("09:00");
  };

  const confirm = () => {
    if (!draftDay) {
      setOpen(false);
      return;
    }
    const [hh, mm] = (timeText || "09:00").split(":").map((s) => parseInt(s, 10));
    const result = new Date(draftDay);
    result.setHours(Number.isFinite(hh) ? hh : 9, Number.isFinite(mm) ? mm : 0, 0, 0);
    onChange(result);
    setOpen(false);
  };

  const label = value
    ? `Hôm nay lúc ${pad(value.getHours())}:${pad(value.getMinutes())}`.replace(
        "Hôm nay",
        isSameDay(value, today)
          ? "Hôm nay"
          : `${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${value.getFullYear()}`,
      )
    : emptyLabel;

  return (
    <div className="relative" ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          "flex w-full items-center justify-between gap-2 rounded-xl border bg-surface-overlay/40 px-3.5 py-2.5 text-sm transition-colors",
          open ? "border-[#1976D2]/60 ring-2 ring-[#1565C0]/20" : "border-border hover:border-[#1976D2]/40",
          value ? "text-text-primary" : "text-text-muted",
        )}
      >
        <span className="truncate">{label}</span>
        <CalendarDaysIcon className="h-4 w-4 shrink-0 text-text-muted" />
      </button>

      {open && ReactDOM.createPortal(
        <div
          ref={popRef}
          style={{ position: "fixed", top: coords.top, left: coords.left, zIndex: 1000 }}
          className="w-[288px] rounded-xl border border-border bg-surface p-3 shadow-xl"
        >
          {/* Month header */}
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-[13px] font-semibold text-text-primary">
              {MONTHS[month]}, {year}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setViewMonth(new Date(year, month - 1, 1))}
                className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-overlay"
                aria-label="Tháng trước"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMonth(new Date(year, month + 1, 1))}
                className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-overlay"
                aria-label="Tháng sau"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Weekday row */}
          <div className="grid grid-cols-7 gap-0.5">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1 text-center text-[11px] font-medium text-text-muted">
                {w}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((cell, i) => {
              const selected = isSameDay(cell.date, draftDay);
              const isToday = isSameDay(cell.date, today);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => pickDay(cell.date)}
                  className={clsx(
                    "flex h-8 w-full items-center justify-center rounded-md text-[12.5px] tabular-nums transition-colors",
                    !cell.current && "text-text-muted/40",
                    cell.current && !selected && "text-text-primary hover:bg-[#1976D2]/10",
                    selected && "bg-[#1565C0] font-semibold text-white",
                    !selected && isToday && cell.current && "font-semibold text-[#1565C0]",
                  )}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          {/* Date / time inputs */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <span className="mb-1 block text-[11px] text-text-muted">Ngày</span>
              <input
                value={dateText}
                onChange={(e) => setDateText(e.target.value)}
                placeholder="DD/MM/YYYY"
                className="w-full rounded-md border border-border bg-surface-overlay/40 px-2 py-1.5 text-[12.5px] text-text-primary placeholder:text-text-muted focus:border-[#1976D2]/60 focus:outline-none"
              />
            </div>
            <div>
              <span className="mb-1 block text-[11px] text-text-muted">Thời gian</span>
              <input
                value={timeText}
                onChange={(e) => setTimeText(e.target.value)}
                placeholder="hh:mm"
                className="w-full rounded-md border border-border bg-surface-overlay/40 px-2 py-1.5 text-[12.5px] text-text-primary placeholder:text-text-muted focus:border-[#1976D2]/60 focus:outline-none"
              />
            </div>
          </div>

          {/* Confirm */}
          <div className="mt-3 flex items-center justify-end">
            <button
              type="button"
              onClick={confirm}
              disabled={!draftDay}
              className={clsx(
                "rounded-lg px-4 py-1.5 text-[12.5px] font-semibold transition-colors",
                draftDay
                  ? "bg-[#1565C0] text-white hover:bg-[#1976D2]"
                  : "cursor-not-allowed bg-[#1565C0]/30 text-white/70",
              )}
            >
              Xác nhận
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};

export const ReminderCreateDialog: React.FC<ReminderCreateDialogProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialContent = "",
  mode = "create",
  initialDate,
  initialRepeat = "none",
}) => {
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  const [content, setContent] = React.useState(initialContent);
  const [quickTime, setQuickTime] = React.useState<QuickTime>(
    mode === "edit" ? "custom" : "30min",
  );
  const [reminderDate, setReminderDate] = React.useState<Date>(
    () => initialDate ?? getQuickDate("30min"),
  );
  const [repeatType, setRepeatType] = React.useState<RepeatType>(initialRepeat);

  // Reset on open
  const [prevIsOpen, setPrevIsOpen] = React.useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setContent(initialContent);
      setQuickTime(mode === "edit" ? "custom" : "30min");
      setReminderDate(initialDate ?? getQuickDate("30min"));
      setRepeatType(initialRepeat);
    }
  }

  const handleQuickSelect = (qt: QuickTime) => {
    setQuickTime(qt);
    if (qt !== "custom") {
      setReminderDate(getQuickDate(qt));
    }
  };

  const canSubmit = content.trim().length > 0;

  const QUICK_OPTIONS: QuickTime[] = ["15min", "30min", "tomorrow9am", "custom"];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      showCloseButton={false}
      contentClassName="rounded-2xl"
      bodyClassName="p-0 overflow-visible"
      initialFocusRef={textareaRef}
      footer={
        <div className="flex items-center justify-end gap-2 px-5 pb-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1565C0]/30"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => {
              onSubmit({
                content: content.trim(),
                reminderDate,
                repeatType,
              });
              onClose();
            }}
            className={clsx(
              "rounded-xl px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1565C0]/40",
              canSubmit
                ? "bg-[#1565C0] text-white hover:bg-[#1976D2]"
                : "cursor-not-allowed bg-[#1565C0]/40 text-white/70",
            )}
          >
            {mode === "edit" ? "Lưu thay đổi" : "Tạo nhắc hẹn"}
          </button>
        </div>
      }
    >
      {/* Header — sticky so it stays visible when content scrolls */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-surface px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1976D2]/10">
          <BellIcon className="h-5 w-5 text-[#1565C0]" />
        </div>
        <h2 className="flex-1 text-base font-semibold text-text-primary">
          {mode === "edit" ? "Chỉnh sửa nhắc hẹn" : "Tạo nhắc hẹn"}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng"
          className="rounded-lg p-1 text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="divide-y divide-border/60">
        {/* Section 1: Content */}
        <div className="px-5 py-4">
          <label className="mb-1.5 block text-xs font-medium text-text-muted">
            Nhập nội dung
          </label>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            placeholder="Nhập nội dung mới hoặc dán link"
            className="w-full resize-none rounded-xl border border-border bg-surface-overlay/40 px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-[#1976D2]/60 focus:outline-none focus:ring-2 focus:ring-[#1565C0]/20"
          />
        </div>

        {/* Section 2: Quick time chips */}
        <div className="px-5 py-4">
          <p className="mb-2.5 text-xs font-medium text-text-muted">
            Chọn thời gian
          </p>
          <div className="flex flex-wrap gap-2">
            {QUICK_OPTIONS.map((qt) => {
              const isActive = quickTime === qt;
              const label = qt === "custom" ? "Khác" : getQuickLabel(qt);
              return (
                <button
                  key={qt}
                  type="button"
                  onClick={() => handleQuickSelect(qt)}
                  className={clsx(
                    "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1565C0]/30",
                    isActive
                      ? "border-[#1976D2]/50 bg-[#DBEAFE]/60 text-[#1565C0]"
                      : "border-border bg-surface-overlay/40 text-text-secondary hover:bg-surface-overlay hover:text-text-primary",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 3: Date-time picker (calendar popover) */}
        <div className="px-5 py-4">
          <p className="mb-1.5 text-xs font-medium text-text-muted">
            Chọn ngày nhắc hẹn
          </p>
          <DateTimePicker
            value={reminderDate}
            emptyLabel="Không thời hạn"
            onChange={(d) => {
              if (d) {
                setReminderDate(d);
                setQuickTime("custom");
              }
            }}
          />
        </div>

        {/* Section 4: Repeat */}
        <div className="px-5 py-4">
          <label className="mb-1.5 block text-xs font-medium text-text-muted">
            Chọn kiểu lặp lại (vd: Lặp lại hàng tuần)
          </label>
          <div className="relative">
            <select
              value={repeatType}
              onChange={(e) => setRepeatType(e.target.value as RepeatType)}
              aria-label="Chọn kiểu lặp lại"
              className="w-full appearance-none rounded-xl border border-border bg-surface-overlay/40 py-2.5 pl-3.5 pr-10 text-sm text-text-primary focus:border-[#1976D2]/60 focus:outline-none focus:ring-2 focus:ring-[#1565C0]/20"
            >
              {REPEAT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default ReminderCreateDialog;
