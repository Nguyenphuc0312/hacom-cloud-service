import React from "react";
import ReactDOM from "react-dom";
import { XMarkIcon, CalendarDaysIcon } from "@heroicons/react/24/outline";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/solid";
import { Modal } from "../../../components/ui";
import type { CreatePollDto } from "@hacom/chat-shared-types/chat";
import clsx from "clsx";

// shared-types ≥ 1.7.0: allowAddOption + hideResultsBeforeVote nằm sẵn trong CreatePollDto.
export type PollCreatePayload = CreatePollDto;

interface PollCreateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (
    payload: PollCreatePayload,
    options: { pinToTop: boolean },
  ) => void;
}

const QUESTION_LIMIT = 200;
const OPTION_LIMIT = 100;
const MAX_OPTIONS = 20;

const pad = (n: number) => String(n).padStart(2, "0");

/* ─────────────────────────────────────────────────────────────
 * Toggle (Zalo style — pill switch, blue when on)
 * ───────────────────────────────────────────────────────────── */
const Toggle: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  id: string;
}> = ({ checked, onChange, id }) => (
  <button
    type="button"
    id={id}
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className={clsx(
      "relative inline-flex h-[22px] w-[42px] shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1565C0]/40",
      checked ? "bg-[#1565C0]" : "bg-[#cfd5db]",
    )}
  >
    <span
      className={clsx(
        "pointer-events-none inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow-sm transition duration-200",
        checked ? "translate-x-[22px]" : "translate-x-[2px]",
      )}
    />
  </button>
);

const ToggleRow: React.FC<{
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  id: string;
  hint?: boolean;
}> = ({ label, checked, onChange, id, hint }) => (
  <div className="flex items-center justify-between gap-3 py-[7px]">
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-1 text-[13px] text-text-primary"
    >
      {label}
      {hint && (
        <span className="flex h-[14px] w-[14px] items-center justify-center rounded-full border border-text-muted/50 text-[9px] font-semibold text-text-muted">
          ?
        </span>
      )}
    </label>
    <Toggle checked={checked} onChange={onChange} id={id} />
  </div>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="mb-1 mt-1 text-[13px] font-semibold text-text-primary">
    {children}
  </h3>
);

/* ─────────────────────────────────────────────────────────────
 * Deadline picker (calendar popover) — Zalo style
 * ───────────────────────────────────────────────────────────── */
const WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const MONTHS = [
  "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6",
  "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12",
];

const DeadlinePicker: React.FC<{
  value: Date | null;
  onChange: (d: Date | null) => void;
}> = ({ value, onChange }) => {
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

  // Position the portal popover directly under the trigger (escapes modal overflow clipping)
  React.useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const update = () => {
      const r = triggerRef.current!.getBoundingClientRect();
      const POP_W = 280;
      const POP_H = 380;
      let left = r.left;
      let top = r.bottom + 6;
      // Keep within viewport
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

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        ref.current && !ref.current.contains(t) &&
        popRef.current && !popRef.current.contains(t)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();

  // 6 weeks grid (42 cells)
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

  const clear = () => {
    onChange(null);
    setDraftDay(null);
    setDateText("");
    setTimeText("");
    setOpen(false);
  };

  const label = value
    ? `${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${value.getFullYear()} ${pad(value.getHours())}:${pad(value.getMinutes())}`
    : "Không thời hạn";

  return (
    <div className="relative" ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          "flex w-full items-center justify-between gap-2 rounded-lg border bg-surface-overlay/40 px-3 py-2.5 text-[13px] transition-colors",
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
          className="w-[280px] rounded-xl border border-border bg-surface p-3 shadow-xl">
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

          {/* Actions */}
          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={clear}
              className="rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-text-secondary transition-colors hover:bg-surface-overlay"
            >
              Xóa thời hạn
            </button>
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

/* ─────────────────────────────────────────────────────────────
 * Main dialog — Zalo "Tạo bình chọn"
 * ───────────────────────────────────────────────────────────── */
export const PollCreateDialog: React.FC<PollCreateDialogProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [question, setQuestion] = React.useState("");
  const [options, setOptions] = React.useState(["", ""]);
  const [endsAt, setEndsAt] = React.useState<Date | null>(null);

  // Thiết lập nâng cao
  const [pinToTop, setPinToTop] = React.useState(false);
  const [allowMultiple, setAllowMultiple] = React.useState(false);
  const [allowAddOption, setAllowAddOption] = React.useState(true);

  // Bình chọn ẩn danh
  const [hideResultsBeforeVote, setHideResultsBeforeVote] = React.useState(false);
  const [hideVoters, setHideVoters] = React.useState(false);

  const firstInputRef = React.useRef<HTMLTextAreaElement | null>(null);
  const optionRefs = React.useRef<(HTMLInputElement | null)[]>([]);

  const [prevIsOpen, setPrevIsOpen] = React.useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setQuestion("");
      setOptions(["", ""]);
      setEndsAt(null);
      setPinToTop(false);
      setAllowMultiple(false);
      setAllowAddOption(true);
      setHideResultsBeforeVote(false);
      setHideVoters(false);
    }
  }

  const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
  const canSubmit =
    question.trim().length > 0 &&
    cleanOptions.length >= 2 &&
    question.length <= QUESTION_LIMIT &&
    options.every((o) => o.length <= OPTION_LIMIT);

  const updateOption = (index: number, value: string) => {
    if (value.length > OPTION_LIMIT) return;
    setOptions((cur) => {
      return cur.map((o, i) => (i === index ? value : o));
    });
  };

  const addOption = () => {
    if (options.length >= MAX_OPTIONS) return;
    setOptions((cur) => [...cur, ""]);
    setTimeout(() => optionRefs.current[options.length]?.focus(), 50);
  };

  const handleOptionKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    index: number,
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (index === options.length - 1 && options.length < MAX_OPTIONS) {
        addOption();
      } else {
        optionRefs.current[index + 1]?.focus();
      }
    }
    if (e.key === "Backspace" && options[index] === "" && options.length > 2) {
      e.preventDefault();
      setOptions((cur) => cur.filter((_, i) => i !== index));
      setTimeout(() => optionRefs.current[Math.max(0, index - 1)]?.focus(), 50);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="full"
      initialFocusRef={firstInputRef}
      contentClassName="rounded-2xl max-w-[680px] max-h-[92vh]"
      bodyClassName="p-0 overflow-visible"
      showCloseButton={false}
      footer={
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-surface-overlay px-5 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface-overlay/70 focus-visible:outline-none"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => {
                onSubmit(
                  {
                    question: question.trim(),
                    options: cleanOptions,
                    allowMultiple,
                    anonymous: hideVoters,
                    endsAt: endsAt ?? undefined,
                    allowAddOption,
                    hideResultsBeforeVote,
                  },
                  { pinToTop },
                );
                onClose();
              }}
              className={clsx(
                "rounded-lg px-5 py-2 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1565C0]/40",
                canSubmit
                  ? "bg-[#1565C0] text-white hover:bg-[#1976D2]"
                  : "cursor-not-allowed bg-[#1565C0]/40 text-white/70",
              )}
            >
              Tạo bình chọn
            </button>
          </div>
        </div>
      }
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <h2 className="text-[16px] font-semibold text-text-primary">
          Tạo bình chọn
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none"
          aria-label="Đóng"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Two-column body */}
      <div className="grid grid-cols-1 gap-x-6 gap-y-5 px-5 py-5 md:grid-cols-2">
        {/* ── LEFT column ── */}
        <div className="space-y-4">
          {/* Chủ đề bình chọn */}
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-text-primary">
              Chủ đề bình chọn
            </label>
            <div className="relative">
              <textarea
                ref={firstInputRef}
                value={question}
                onChange={(e) =>
                  e.target.value.length <= QUESTION_LIMIT &&
                  setQuestion(e.target.value)
                }
                rows={5}
                placeholder="Nhập chủ đề bình chọn"
                className="w-full resize-none rounded-lg border border-border bg-surface-overlay/40 px-3 py-2.5 pb-7 text-[13px] text-text-primary placeholder:text-text-muted focus:border-[#1976D2]/60 focus:outline-none focus:ring-2 focus:ring-[#1565C0]/20"
              />
              <span className="pointer-events-none absolute bottom-2 right-3 text-[11px] tabular-nums text-text-muted">
                {question.length}/{QUESTION_LIMIT}
              </span>
            </div>
          </div>

          {/* Các lựa chọn */}
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-text-primary">
              Các lựa chọn
            </label>
            <div className="space-y-2">
              {options.map((option, index) => (
                <input
                  key={index}
                  ref={(el) => {
                    optionRefs.current[index] = el;
                  }}
                  value={option}
                  onChange={(e) => updateOption(index, e.target.value)}
                  onKeyDown={(e) => handleOptionKeyDown(e, index)}
                  placeholder={`Lựa chọn ${index + 1}`}
                  className="w-full rounded-lg border border-border bg-surface-overlay/40 px-3 py-2.5 text-[13px] text-text-primary placeholder:text-text-muted focus:border-[#1976D2]/60 focus:outline-none focus:ring-2 focus:ring-[#1565C0]/20"
                />
              ))}
            </div>
            {options.length < MAX_OPTIONS && (
              <button
                type="button"
                onClick={addOption}
                className="mt-2.5 inline-flex items-center gap-1 text-[13px] font-medium text-[#1565C0] transition-colors hover:text-[#1976D2] focus-visible:outline-none"
              >
                <span className="text-[15px] leading-none">+</span>
                Thêm lựa chọn
              </button>
            )}
          </div>
        </div>

        {/* ── RIGHT column ── */}
        <div className="space-y-4">
          {/* Thời hạn bình chọn */}
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-text-primary">
              Thời hạn bình chọn
            </label>
            <DeadlinePicker value={endsAt} onChange={setEndsAt} />
          </div>

          {/* Thiết lập nâng cao */}
          <div>
            <SectionTitle>Thiết lập nâng cao</SectionTitle>
            <div className="divide-y divide-border/50">
              <ToggleRow
                id="poll-pin"
                label="Ghim lên đầu trò chuyện"
                checked={pinToTop}
                onChange={setPinToTop}
                hint
              />
              <ToggleRow
                id="poll-multiple"
                label="Chọn nhiều phương án"
                checked={allowMultiple}
                onChange={setAllowMultiple}
                hint
              />
              <ToggleRow
                id="poll-add-option"
                label="Có thể thêm phương án"
                checked={allowAddOption}
                onChange={setAllowAddOption}
                hint
              />
            </div>
          </div>

          {/* Bình chọn ẩn danh */}
          <div>
            <SectionTitle>Bình chọn ẩn danh</SectionTitle>
            <div className="divide-y divide-border/50">
              <ToggleRow
                id="poll-hide-results"
                label="Ẩn kết quả khi chưa bình chọn"
                checked={hideResultsBeforeVote}
                onChange={setHideResultsBeforeVote}
                hint
              />
              <ToggleRow
                id="poll-hide-voters"
                label="Ẩn người bình chọn"
                checked={hideVoters}
                onChange={setHideVoters}
                hint
              />
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default PollCreateDialog;
