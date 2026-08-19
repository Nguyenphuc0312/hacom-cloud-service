import React from "react";
import clsx from "clsx";
import {
  PencilSquareIcon,
  ArchiveBoxArrowDownIcon,
  ExclamationCircleIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
} from "@heroicons/react/24/outline";
import type { Task, TaskStatus } from "../types/task.types";
import { TASK_PRIORITY_LABELS, TASK_PRIORITY_COLORS } from "../types/task.types";
import { AssigneeAvatar } from "./AssigneePicker";

const COLUMNS: Array<{ status: TaskStatus; label: string; color: string }> = [
  { status: 'TODO', label: 'Cần làm', color: 'border-t-gray-400' },
  { status: 'IN_PROGRESS', label: 'Đang làm', color: 'border-t-blue-500' },
  { status: 'DONE', label: 'Hoàn thành', color: 'border-t-green-500' },
];

const STATUS_ORDER: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE'];

const isOverdue = (task: Task) =>
  !!task.dueDate && task.status !== 'DONE' && task.status !== 'ARCHIVED' && new Date(task.dueDate) < new Date();

const formatDate = (iso: string | null) => {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
};

interface KanbanCardProps {
  task: Task;
  onEdit: (task: Task) => void;
  onArchive: (task: Task) => void;
  onMoveStatus: (task: Task, status: TaskStatus) => void;
}

const KanbanCard: React.FC<KanbanCardProps> = ({ task, onEdit, onArchive, onMoveStatus }) => {
  const overdue = isOverdue(task);
  const currentIdx = STATUS_ORDER.indexOf(task.status);

  return (
    <div className="group rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-snug">{task.title}</span>
        <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(task)}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200"
            title="Sửa"
          >
            <PencilSquareIcon className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onArchive(task)}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-orange-500"
            title="Lưu trữ"
          >
            <ArchiveBoxArrowDownIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {task.description && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{task.description}</p>
      )}

      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        <span className={clsx("rounded-full px-1.5 py-0.5 text-xs font-medium", TASK_PRIORITY_COLORS[task.priority])}>
          {TASK_PRIORITY_LABELS[task.priority]}
        </span>
        {task.dueDate && (
          <span className={clsx("flex items-center gap-0.5 text-xs", overdue ? "text-red-500 font-medium" : "text-gray-400 dark:text-gray-500")}>
            {overdue && <ExclamationCircleIcon className="h-3 w-3" />}
            {formatDate(task.dueDate)}
          </span>
        )}
        {task.assigneeId && task.assigneeName && (
          <span className="ml-auto flex items-center gap-1">
            <AssigneeAvatar user={{ displayName: task.assigneeName, avatar: task.assigneeAvatar ?? null }} size={5} />
          </span>
        )}
      </div>

      {/* Quick status move buttons */}
      <div className="mt-2 flex gap-1 justify-end">
        {currentIdx > 0 && (
          <button
            onClick={() => onMoveStatus(task, STATUS_ORDER[currentIdx - 1])}
            className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700"
            title={`Chuyển về ${COLUMNS[currentIdx - 1].label}`}
          >
            <ChevronLeftIcon className="h-3 w-3" />
            {COLUMNS[currentIdx - 1].label}
          </button>
        )}
        {currentIdx < STATUS_ORDER.length - 1 && (
          <button
            onClick={() => onMoveStatus(task, STATUS_ORDER[currentIdx + 1])}
            className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800"
            title={`Chuyển sang ${COLUMNS[currentIdx + 1].label}`}
          >
            {COLUMNS[currentIdx + 1].label}
            <ChevronRightIcon className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
};

interface KanbanViewProps {
  items: Task[];
  onEdit: (task: Task) => void;
  onArchive: (task: Task) => void;
  onMoveStatus: (task: Task, status: TaskStatus) => void;
}

export const KanbanView: React.FC<KanbanViewProps> = ({ items, onEdit, onArchive, onMoveStatus }) => {
  const visibleItems = items.filter((t) => t.status !== 'ARCHIVED');

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
      {COLUMNS.map((col) => {
        const columnTasks = visibleItems.filter((t) => t.status === col.status);
        return (
          <div key={col.status} className={clsx("flex flex-col rounded-xl border-t-4 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700", col.color)}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{col.label}</span>
              <span className="rounded-full bg-gray-200 dark:bg-gray-700 px-2 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-300">
                {columnTasks.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-32">
              {columnTasks.length === 0 && (
                <p className="text-center text-xs text-gray-400 dark:text-gray-600 pt-4">Không có công việc</p>
              )}
              {columnTasks.map((task) => (
                <KanbanCard
                  key={task.id}
                  task={task}
                  onEdit={onEdit}
                  onArchive={onArchive}
                  onMoveStatus={onMoveStatus}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
