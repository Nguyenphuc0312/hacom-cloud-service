import React from "react";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button, Checkbox, Modal } from "../../../components/ui";

export interface PollCreatePayload {
  question: string;
  options: string[];
  allowMultiple: boolean;
  anonymous: boolean;
}

interface PollCreateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: PollCreatePayload) => void;
}

export const PollCreateDialog: React.FC<PollCreateDialogProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [question, setQuestion] = React.useState("");
  const [options, setOptions] = React.useState(["", ""]);
  const [allowMultiple, setAllowMultiple] = React.useState(false);
  const [anonymous, setAnonymous] = React.useState(false);
  const firstInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    setQuestion("");
    setOptions(["", ""]);
    setAllowMultiple(false);
    setAnonymous(false);
  }, [isOpen]);

  const cleanOptions = options.map((option) => option.trim()).filter(Boolean);
  const canSubmit = question.trim().length > 0 && cleanOptions.length >= 2;

  const updateOption = (index: number, value: string) => {
    setOptions((current) =>
      current.map((option, optionIndex) =>
        optionIndex === index ? value : option,
      ),
    );
  };

  const addOption = () => {
    setOptions((current) => [...current, ""]);
  };

  const removeOption = (index: number) => {
    setOptions((current) =>
      current.length <= 2
        ? current
        : current.filter((_, optionIndex) => optionIndex !== index),
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Tạo bình chọn"
      size="md"
      initialFocusRef={firstInputRef}
      contentClassName="rounded-lg"
      bodyClassName="p-4 sm:p-5"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() => {
              onSubmit({
                question: question.trim(),
                options: cleanOptions,
                allowMultiple,
                anonymous,
              });
              onClose();
            }}
          >
            Tạo bình chọn
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="text-sm font-semibold text-text-primary">
            Câu hỏi bình chọn
          </span>
          <input
            ref={firstInputRef}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            className="input-surface mt-2 w-full px-3 text-sm text-text-primary focus:outline-none"
            placeholder="Ví dụ: Chọn thời gian họp nhóm?"
          />
        </label>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-text-primary">
              Các lựa chọn
            </p>
            <button
              type="button"
              onClick={addOption}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-primary transition-micro hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30"
            >
              <PlusIcon className="h-4 w-4" aria-hidden="true" />
              Thêm lựa chọn
            </button>
          </div>
          <div className="space-y-2">
            {options.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  value={option}
                  onChange={(event) => updateOption(index, event.target.value)}
                  className="input-surface min-w-0 flex-1 px-3 text-sm text-text-primary focus:outline-none"
                  placeholder={`Lựa chọn ${index + 1}`}
                />
                <button
                  type="button"
                  onClick={() => removeOption(index)}
                  disabled={options.length <= 2}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-text-muted transition-micro hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Xóa lựa chọn"
                >
                  <TrashIcon className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-border/70 bg-surface-overlay/55 p-3">
          <Checkbox
            checked={allowMultiple}
            onChange={(event) => setAllowMultiple(event.target.checked)}
            label="Cho phép chọn nhiều đáp án"
          />
          <Checkbox
            checked={anonymous}
            onChange={(event) => setAnonymous(event.target.checked)}
            label="Ẩn người bình chọn"
          />
        </div>
      </div>
    </Modal>
  );
};

export default PollCreateDialog;
