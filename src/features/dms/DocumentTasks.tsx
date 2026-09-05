import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/Button";
import { dmsApi, DmsApiError, type DmsTask } from "./dmsApi";

export const DocumentTasks: React.FC<{ tasks: DmsTask[]; subjectId: string; canProcess: boolean; onRefresh: () => void }> = ({ tasks, subjectId, canProcess, onRefresh }) => {
  const { t } = useTranslation("dms");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const run = async (task: DmsTask, action: "start" | "complete"): Promise<void> => {
    if (busy) return;
    setBusy(task.id); setError(null);
    try { await dmsApi.task(task.id, action, task.revision); onRefresh(); }
    catch (cause) { setError(t(cause instanceof DmsApiError && cause.status === 409 ? "errors.conflict" : cause instanceof DmsApiError && [403, 404].includes(cause.status) ? "errors.forbidden" : "tasks.retryError")); }
    finally { setBusy(null); }
  };
  return <div className="space-y-3">
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    {!tasks.length && <p className="text-sm text-text-secondary">{t("tasks.empty")}</p>}
    {tasks.map((task) => { const action = task.state === "ASSIGNED" || (task.state === "OVERDUE" && !task.started_at) ? "start" : task.state === "IN_PROGRESS" || (task.state === "OVERDUE" && task.started_at) ? "complete" : null; return <div key={task.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
      <div className="min-w-0"><p className="text-sm font-semibold text-text-primary">{t(`tasks.roles.${task.role}`)}{task.assignee_subject_id === subjectId ? ` · ${t("tasks.mine")}` : ""}</p>
        <p className={`text-sm ${task.state === "OVERDUE" ? "text-danger" : "text-text-secondary"}`}>{t(`tasks.states.${task.state}`)}{task.due_at ? ` · ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(task.due_at))}` : ""}</p></div>
      {canProcess && task.assignee_subject_id === subjectId && action && <Button size="sm" disabled={busy !== null} isLoading={busy === task.id} onClick={() => void run(task, action)}>{t(action === "start" ? "actions.start" : "actions.complete")}</Button>}
    </div>; })}
  </div>;
};
