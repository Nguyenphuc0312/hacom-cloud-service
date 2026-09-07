import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { OrganizationMemberPicker } from "./OrganizationMemberPicker";
import { dmsApi } from "./dmsApi";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => `${key}${params?.name ? ` ${params.name}` : ""}` }) }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const members = [
  { subjectId: "one", employeeCode: "HC000001", displayName: "Nguyễn An" },
  { subjectId: "two", employeeCode: "HC000002", displayName: "Trần Bình" },
];
const mount = (organizationId = "unit-a") => <form aria-label="workflow"><OrganizationMemberPicker organizationId={organizationId} name="actors" label="Approvers" required max={2} /></form>;
const search = () => { fireEvent.change(screen.getByRole("textbox"), { target: { value: "Nguyễn" } }); fireEvent.click(screen.getByRole("button", { name: "members.search" })); };

it("submits only selected server identities in selection order and requires a selection", async () => {
  const lookup = vi.spyOn(dmsApi, "organizationMembers").mockResolvedValue({ items: members });
  render(mount());
  const form = screen.getByRole("form") as HTMLFormElement;
  expect(form.checkValidity()).toBe(false);
  search();
  await screen.findByRole("option", { name: "Trần Bình · HC000002" });
  expect(lookup).toHaveBeenCalledWith("unit-a", "Nguyễn", expect.any(AbortSignal));
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "two" } });
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "one" } });
  expect(new FormData(form).getAll("actors")).toEqual(["two", "one"]);
  expect(form.checkValidity()).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "members.removeLabel Trần Bình" }));
  expect(new FormData(form).getAll("actors")).toEqual(["one"]);
  expect(document.activeElement).toBe(screen.getByRole("combobox"));
});

it("cancels stale searches and clears identities when organization changes", async () => {
  let resolve!: (value: { items: typeof members }) => void;
  const lookup = vi.spyOn(dmsApi, "organizationMembers").mockReturnValue(new Promise((done) => { resolve = done; }));
  const view = render(mount());
  search();
  const signal = lookup.mock.calls[0][2];
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Other" } });
  expect(signal.aborted).toBe(true);
  await act(async () => resolve({ items: members }));
  expect(screen.queryByRole("option", { name: /HC000001/ })).toBeNull();
  lookup.mockResolvedValue({ items: members });
  search();
  await screen.findByRole("option", { name: /HC000001/ });
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "one" } });
  view.rerender(mount("unit-b"));
  expect(new FormData(screen.getByRole("form") as HTMLFormElement).getAll("actors")).toEqual([]);
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("");
});

it("exposes an actionable error and retries without losing the search", async () => {
  const lookup = vi.spyOn(dmsApi, "organizationMembers").mockRejectedValueOnce(new Error("internal secret must not render")).mockResolvedValueOnce({ items: [] });
  render(mount());
  search();
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("members.unavailable"));
  expect(screen.queryByText(/internal secret/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "members.search" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("members.empty"));
  expect(lookup).toHaveBeenCalledTimes(2);
});
