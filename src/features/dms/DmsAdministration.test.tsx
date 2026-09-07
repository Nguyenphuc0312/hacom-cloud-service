import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DmsAdministration } from "./DmsAdministration";
import { DmsApiError, dmsApi, type DmsPrincipal } from "./dmsApi";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("links the active administration tab to its panel and supports arrow navigation", async () => {
  vi.spyOn(dmsApi, "templates").mockResolvedValue([]);
  vi.spyOn(dmsApi, "workflows").mockResolvedValue([]);
  const principal: DmsPrincipal = { subjectId: "admin", employeeId: "employee", employeeCode: "HC000001", organizationIds: ["org-a"], capabilities: [], permissionVersion: 1 };
  render(<DmsAdministration principal={principal} />);
  const tablist = screen.getByRole("tablist");
  const templates = screen.getByRole("tab", { name: "admin.tabs.templates" });
  expect(templates.getAttribute("aria-controls")).toBe("dms-admin-panel-templates");
  fireEvent.keyDown(tablist, { key: "ArrowRight" });
  const workflows = screen.getByRole("tab", { name: "admin.tabs.workflows" });
  expect(workflows.getAttribute("aria-selected")).toBe("true");
  expect(document.activeElement).toBe(workflows);
  expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(workflows.id);
});

it("limits the catalog form to DMS-managed target types", async () => {
  vi.spyOn(dmsApi, "templates").mockResolvedValue([]);
  vi.spyOn(dmsApi, "catalogs").mockResolvedValue([]);
  const principal: DmsPrincipal = { subjectId: "admin", employeeId: "employee", employeeCode: "HC000001", organizationIds: ["org-a"], capabilities: ["document.catalog.manage"], permissionVersion: 1 };
  render(<DmsAdministration principal={principal} />);
  fireEvent.click(screen.getByRole("tab", { name: "admin.tabs.catalogs" }));
  await waitFor(() => expect(dmsApi.catalogs).toHaveBeenCalledWith("org-a"));
  const catalogType = screen.getByLabelText("admin.fields.catalogType") as HTMLSelectElement;
  expect(Array.from(catalogType.options, (option) => option.value)).toEqual(["URGENCY", "CONFIDENTIALITY", "DELIVERY_METHOD", "DOCUMENT_GROUP", "DOCUMENT_TYPE"]);
});

it("announces a successful catalog save", async () => {
  vi.spyOn(dmsApi, "catalogs").mockResolvedValue([]);
  const upsertCatalog = vi.spyOn(dmsApi, "upsertCatalog").mockResolvedValue({} as never);
  const principal: DmsPrincipal = { subjectId: "admin", employeeId: "employee", employeeCode: "HC000001", organizationIds: ["org-a"], capabilities: ["document.catalog.manage"], permissionVersion: 1 };
  render(<DmsAdministration principal={principal} />);
  fireEvent.click(screen.getByRole("tab", { name: "admin.tabs.catalogs" }));
  await screen.findByLabelText("admin.fields.catalogType");
  fireEvent.change(screen.getByLabelText("admin.fields.code"), { target: { value: "URGENT" } });
  fireEvent.change(screen.getByLabelText("admin.fields.name"), { target: { value: "Urgent" } });
  fireEvent.click(screen.getByRole("button", { name: "admin.save" }));
  await waitFor(() => expect(upsertCatalog).toHaveBeenCalled());
  expect(screen.getByRole("status").textContent).toContain("admin.saved");
});

it("explains a configuration permission denial instead of reporting an outage", async () => {
  vi.spyOn(dmsApi, "templates").mockRejectedValue(new DmsApiError(403, "DMS_FORBIDDEN"));
  const principal: DmsPrincipal = { subjectId: "reader", employeeId: "employee", employeeCode: "HC000002", organizationIds: ["org-a"], capabilities: [], permissionVersion: 1 };
  render(<DmsAdministration principal={principal} />);
  expect((await screen.findByRole("alert")).textContent).toContain("admin.readOnlyUnavailable");
  expect(screen.getByRole("button", { name: "actions.refresh" })).toBeTruthy();
});
