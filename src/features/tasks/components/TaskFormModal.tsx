import React, { useState, useEffect } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import type { Task, TaskStatus, TaskPriority, CreateTaskPayload } from "../types/task.types";
import { TASK_STATUS_LABELS, TASK_PRIORITY_LABELS } from "../types/task.types";
import { AssigneePicker, type AssigneeUser } from "./AssigneePicker";
import { useAuthStore } from "../../../stores/authStore";

interface TaskFormModalProps {
  task?: Task | null;
  onClose: () => void;
  onSave: (payload: CreateTaskPayload) => Promise<void>;
}

const STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "DONE"];
const PRIORITIES: TaskPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

const toDateInputValue = (iso: string | null | undefined): string => {
  if (!iso) return "";
  return iso.slice(0, 16); // YYYY-MM-DDTHH:mm
};

export const TaskFormModal: React.FC<TaskFormModalProps> = ({ task, onClose, onSave }) => {
  const currentUser = useAuthStore((s) => s.user);
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "TODO");
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "MEDIUM");
  const [dueDate, setDueDate] = useState(toDateInputValue(task?.dueDate));
  const [startDate, setStartDate] = useState(toDateInputValue(task?.startDate));
  const [assignee, setAssignee] = useState<AssigneeUser | null>(
    task?.assigneeId ? { id: task.assigneeId, displayName: task.assigneeName ?? task.assigneeId, avatar: task.assigneeAvatar ?? null } : null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [titleError, setTitleError] = useState("");

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? "");
      setStatus(task.status === "ARCHIVED" ? "TODO" : task.status);
      setPriority(task.priority);
      setDueDate(toDateInputValue(task.dueDate));
      setStartDate(toDateInputValue(task.startDate));
      setAssignee(task.assigneeId ? { id: task.assigneeId, displayName: task.assigneeName ?? task.assigneeId, avatar: task.assigneeAvatar ?? null } : null);
    }
  }, [task]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setTitleError("Tiêu đề không được để trống");
      return;
    }
    setTitleError("");
    setIsSubmitting(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        priority,
        dueDate: dueDate || undefined,
        startDate: startDate || undefined,
        assigneeId: assignee?.id,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-xl bg-surface shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-text-primary">
            {task ? "Sửa công việc" : "Tạo công việc"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-primary transition-micro"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="min-h-0 flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">
              Tiêu đề <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setTitleError(""); }}
              className={clsx(
                "w-full rounded-lg border px-3 py-2 text-sm bg-surface text-text-primary",
                "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
                titleError ? "border-red-400" : "border-border",
              )}
              placeholder="Nhập tiêu đề công việc"
            />
            {titleError && <p className="mt-1 text-xs text-red-500">{titleError}</p>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Mô tả</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
              placeholder="Mô tả công việc (không bắt buộc)"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">Trạng thái</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">Độ ưu tiên</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{TASK_PRIORITY_LABELS[p]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">Ngày bắt đầu</label>
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">Deadline</label>
              <input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Người phụ trách</label>
            <AssigneePicker
              value={assignee}
              onChange={setAssignee}
              currentUserId={currentUser?.id}
              currentUserName={currentUser?.effectiveDisplayName ?? currentUser?.displayName ?? currentUser?.username}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-border py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover transition-micro"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 rounded-lg bg-primary py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60 transition-micro"
            >
              {isSubmitting ? "Đang lưu..." : task ? "Cập nhật" : "Tạo công việc"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
