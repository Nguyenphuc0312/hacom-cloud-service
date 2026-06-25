import React from "react";
import {
  XMarkIcon,
  BellIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import { Modal } from "../../../components/ui";
import clsx from "clsx";

export interface ReminderCreatePayload {
  content: string;
  reminderDate: Date;
  repeatType: RepeatType;
}

type QuickTime = "15min" | "30min" | "tomorrow9am" | "custom";
type RepeatType = "none" | "daily" | "weekly" | "monthly";

interface ReminderCreateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: ReminderCreatePayload) => void;
  /** Pre-fill content (e.g. from a forwarded message) */
  initialContent?: string;
}

const REPEAT_OPTIONS: { value: RepeatType; label: string }[] = [
  { value: "none", label: "Không lặp lại" },
  { value: "daily", label: "Lặp lại hàng ngày" },
  { value: "weekly", label: "Lặp lại hàng tuần" },
  { value: "monthly", label: "Lặp lại hàng tháng" },
];

const toDatetimeLocal = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};


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

export const ReminderCreateDialog: React.FC<ReminderCreateDialogProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialContent = "",
}) => {
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  const [content, setContent] = React.useState(initialContent);
  const [quickTime, setQuickTime] = React.useState<QuickTime>("30min");
  const [reminderDate, setReminderDate] = React.useState<Date>(() =>
    getQuickDate("30min"),
  );
  const [repeatType, setRepeatType] = React.useState<RepeatType>("none");

  // Reset on open
  const [prevIsOpen, setPrevIsOpen] = React.useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setContent(initialContent);
      setQuickTime("30min");
      setReminderDate(getQuickDate("30min"));
      setRepeatType("none");
    }
  }

  const handleQuickSelect = (qt: QuickTime) => {
    setQuickTime(qt);
    if (qt !== "custom") {
      setReminderDate(getQuickDate(qt));
    }
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const d = new Date(e.target.value);
    if (!isNaN(d.getTime())) {
      setReminderDate(d);
      setQuickTime("custom");
    }
  };

  const minDate = toDatetimeLocal(
    new Date(Date.now() + 60_000), // at least 1 min from now
  );

  const canSubmit = content.trim().length > 0;

  const QUICK_OPTIONS: QuickTime[] = ["15min", "30min", "tomorrow9am", "custom"];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      showCloseButton={false}
      contentClassName="rounded-2xl"
      bodyClassName="p-0"
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
            Tạo nhắc hẹn
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
          Tạo nhắc hẹn
        </h2>
        <button
          type="button"
          onClick={onClose}
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
              const label =
                qt === "custom" ? "Khác" : getQuickLabel(qt);
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

        {/* Section 3: Date-time picker */}
        <div className="px-5 py-4">
          <p className="mb-1.5 text-xs font-medium text-text-muted">
            Chọn ngày nhắc hẹn
          </p>
          <input
            type="datetime-local"
            value={toDatetimeLocal(reminderDate)}
            min={minDate}
            onChange={handleDateChange}
            className="w-full rounded-xl border border-border bg-surface-overlay/40 px-3.5 py-2.5 text-sm text-text-primary focus:border-[#1976D2]/60 focus:outline-none focus:ring-2 focus:ring-[#1565C0]/20 hover:border-[#1976D2]/40 transition-colors"
          />
        </div>

        {/* Section 4: Repeat */}
        <div className="px-5 py-4">
          <label className="mb-1.5 block text-xs font-medium text-text-muted">
            Lặp lại
          </label>
          <div className="relative">
            <select
              value={repeatType}
              onChange={(e) => setRepeatType(e.target.value as RepeatType)}
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
