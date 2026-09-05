import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DocumentTasks } from "./DocumentTasks";
import { dmsApi, DmsApiError } from "./dmsApi";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const task = { id: "one", assignee_subject_id: "me", role: "PRIMARY", state: "ASSIGNED", revision: 2, due_at: null, started_at: null };

it("offers actions only for own task and server capability", () => {
  const view = render(<DocumentTasks tasks={[task, { ...task, id: "two", assignee_subject_id: "other", role: "COORDINATOR" }]} subjectId="me" canProcess onRefresh={() => {}} />);
  expect(screen.getAllByRole("button", { name: "actions.start" })).toHaveLength(1);
  view.rerender(<DocumentTasks tasks={[task]} subjectId="me" canProcess={false} onRefresh={() => {}} />);
  expect(screen.queryByRole("button")).toBeNull();
});

it("renders failure, keeps retry available, and refreshes only after success", async () => {
  const api = vi.spyOn(dmsApi, "task").mockRejectedValueOnce(new Error("private failure")).mockResolvedValueOnce({});
  const refresh = vi.fn();
  render(<DocumentTasks tasks={[task]} subjectId="me" canProcess onRefresh={refresh} />);
  fireEvent.click(screen.getByRole("button"));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("tasks.retryError"));
  expect(refresh).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button"));
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  expect(api).toHaveBeenLastCalledWith("one", "start", 2);
});

it("distinguishes stale revision from retryable service errors", async () => {
  vi.spyOn(dmsApi, "task").mockRejectedValue(new DmsApiError(409, "TASK_REVISION_STALE"));
  render(<DocumentTasks tasks={[{ ...task, state: "IN_PROGRESS" }]} subjectId="me" canProcess onRefresh={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "actions.complete" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("errors.conflict"));
});

it("keeps an overdue task actionable according to whether it was started", () => {
  const { rerender } = render(<DocumentTasks tasks={[{ ...task, state: "OVERDUE" }]} subjectId="me" canProcess onRefresh={() => {}} />);
  expect(screen.getByRole("button", { name: "actions.start" })).toBeVisible();
  rerender(<DocumentTasks tasks={[{ ...task, state: "OVERDUE", started_at: "2026-01-01T00:00:00.000Z" }]} subjectId="me" canProcess onRefresh={() => {}} />);
  expect(screen.getByRole("button", { name: "actions.complete" })).toBeVisible();
});
