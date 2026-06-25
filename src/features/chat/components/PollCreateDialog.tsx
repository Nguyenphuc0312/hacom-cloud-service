import React from "react";
import { CalendarDaysIcon, PlusIcon, TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { ChartBarIcon } from "@heroicons/react/24/solid";
import { Modal } from "../../../components/ui";
import type { CreatePollDto } from "@hacom/chat-shared-types/chat";
import clsx from "clsx";

export type PollCreatePayload = CreatePollDto;

interface PollCreateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: PollCreatePayload) => void;
}

const QUESTION_LIMIT = 150;
const OPTION_LIMIT = 80;
const MAX_OPTIONS = 10;

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
      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1565C0]/40",
      checked ? "bg-[#1565C0]" : "bg-border",
    )}
  >
    <span
      className={clsx(
        "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition duration-200",
        checked ? "translate-x-5" : "translate-x-0",
      )}
    />
  </button>
);

const ToggleRow: React.FC<{
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  id: string;
}> = ({ label, description, checked, onChange, id }) => (
  <div className="flex items-center justify-between gap-4 py-0.5">
    <div className="min-w-0">
      <label htmlFor={id} className="cursor-pointer text-sm font-medium text-text-primary">
        {label}
      </label>
      {description && (
        <p className="text-xs text-text-muted">{description}</p>
      )}
    </div>
    <Toggle checked={checked} onChange={onChange} id={id} />
  </div>
);

export const PollCreateDialog: React.FC<PollCreateDialogProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [question, setQuestion] = React.useState("");
  const [options, setOptions] = React.useState(["", ""]);
  const [allowMultiple, setAllowMultiple] = React.useState(false);
  const [anonymous, setAnonymous] = React.useState(false);
  const [hasDeadline, setHasDeadline] = React.useState(false);
  const [endsAt, setEndsAt] = React.useState("");
  const firstInputRef = React.useRef<HTMLTextAreaElement | null>(null);
  const optionRefs = React.useRef<(HTMLInputElement | null)[]>([]);

  const [prevIsOpen, setPrevIsOpen] = React.useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setQuestion("");
      setOptions(["", ""]);
      setAllowMultiple(false);
      setAnonymous(false);
      setHasDeadline(false);
      setEndsAt("");
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
    setOptions((cur) => cur.map((o, i) => (i === index ? value : o)));
  };

  const addOption = () => {
    if (options.length >= MAX_OPTIONS) return;
    setOptions((cur) => [...cur, ""]);
    setTimeout(() => {
      optionRefs.current[options.length]?.focus();
    }, 50);
  };

  const removeOption = (index: number) => {
    if (options.length <= 2) return;
    setOptions((cur) => cur.filter((_, i) => i !== index));
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
      removeOption(index);
      setTimeout(() => optionRefs.current[Math.max(0, index - 1)]?.focus(), 50);
    }
  };

  const minEndsAt = (() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 10);
    return d.toISOString().slice(0, 16);
  })();

  const formatEndsAt = (s: string): string => {
    const d = new Date(s);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      initialFocusRef={firstInputRef}
      contentClassName="rounded-2xl"
      bodyClassName="p-0"
      showCloseButton={false}
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
                question: question.trim(),
                options: cleanOptions,
                allowMultiple,
                anonymous,
                endsAt: hasDeadline && endsAt ? new Date(endsAt) : undefined,
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
            Tạo bình chọn
          </button>
        </div>
      }
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1976D2]/10">
          <ChartBarIcon className="h-5 w-5 text-[#1565C0]" />
        </div>
        <h2 className="flex-1 text-base font-semibold text-text-primary">
          Tạo bình chọn
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-0 divide-y divide-border/60">
        {/* Question */}
        <div className="px-5 py-4">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Câu hỏi
            </span>
            <span
              className={clsx(
                "text-xs tabular-nums",
                question.length > QUESTION_LIMIT
                  ? "text-danger"
                  : "text-text-muted",
              )}
            >
              {question.length}/{QUESTION_LIMIT}
            </span>
          </div>
          <textarea
            ref={firstInputRef}
            value={question}
            onChange={(e) =>
              e.target.value.length <= QUESTION_LIMIT &&
              setQuestion(e.target.value)
            }
            rows={2}
            placeholder="Nhập câu hỏi bình chọn..."
            className="w-full resize-none rounded-xl border border-border bg-surface-overlay/40 px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-[#1976D2]/60 focus:outline-none focus:ring-2 focus:ring-[#1565C0]/20"
          />
        </div>

        {/* Options */}
        <div className="px-5 py-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Các lựa chọn
            </span>
            <span className="text-xs text-text-muted">
              {options.length}/{MAX_OPTIONS}
            </span>
          </div>
          <div className="space-y-2">
            {options.map((option, index) => (
              <div key={index} className="flex items-center gap-2.5">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1976D2]/10 text-xs font-semibold text-[#1565C0]">
                  {index + 1}
                </div>
                <div className="relative flex-1">
                  <input
                    ref={(el) => { optionRefs.current[index] = el; }}
                    value={option}
                    onChange={(e) => updateOption(index, e.target.value)}
                    onKeyDown={(e) => handleOptionKeyDown(e, index)}
                    placeholder={`Lựa chọn ${index + 1}`}
                    className="w-full rounded-xl border border-border bg-surface-overlay/40 py-2 pl-3 pr-12 text-sm text-text-primary placeholder:text-text-muted focus:border-[#1976D2]/60 focus:outline-none focus:ring-2 focus:ring-[#1565C0]/20"
                  />
                  {option.length > 0 && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] tabular-nums text-text-muted">
                      {option.length}/{OPTION_LIMIT}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeOption(index)}
                  disabled={options.length <= 2}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none"
                  aria-label="Xóa lựa chọn"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          {options.length < MAX_OPTIONS && (
            <button
              type="button"
              onClick={addOption}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium text-[#1565C0] transition-colors hover:bg-[#1976D2]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1565C0]/30"
            >
              <PlusIcon className="h-4 w-4" />
              Thêm lựa chọn
            </button>
          )}
        </div>

        {/* Settings */}
        <div className="space-y-3 px-5 py-4">
          <ToggleRow
            id="poll-multiple"
            label="Cho phép chọn nhiều đáp án"
            checked={allowMultiple}
            onChange={setAllowMultiple}
          />
          <ToggleRow
            id="poll-anonymous"
            label="Ẩn danh người bình chọn"
            checked={anonymous}
            onChange={setAnonymous}
          />
          <ToggleRow
            id="poll-deadline"
            label="Đặt thời gian kết thúc"
            checked={hasDeadline}
            onChange={setHasDeadline}
          />
          {hasDeadline && (
            <label className="relative block cursor-pointer">
              <div className="flex items-center justify-between rounded-xl border border-border bg-surface-overlay/40 px-3.5 py-2 transition-colors hover:border-[#1976D2]/40">
                <span className={clsx("text-sm", endsAt ? "text-text-primary" : "text-text-muted")}>
                  {endsAt ? formatEndsAt(endsAt) : "DD/MM/YY HH:MM"}
                </span>
                <CalendarDaysIcon className="h-4 w-4 text-text-muted" />
              </div>
              <input
                type="datetime-local"
                value={endsAt}
                min={minEndsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default PollCreateDialog;
