import { beforeEach, describe, expect, it, vi } from "vitest";
import { dmsApi } from "./dmsApi";

const validToken = (): string => {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 120 }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${payload}.signature`;
};

describe("DMS API trust boundary", () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem("hacom.dms.access-token", validToken());
  });

  it("sends only the resource bearer and server correlation ID for principal resolution", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      subjectId: "subject-1",
      employeeId: "employee-1",
      employeeCode: "HC0001",
      organizationIds: ["org-1"],
      capabilities: ["document.access"],
      permissionVersion: 1,
    }), { status: 200, headers: { "content-type": "application/json" } }));

    await expect(dmsApi.principal()).resolves.toMatchObject({ employeeCode: "HC0001" });
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("authorization")).toMatch(/^Bearer /);
    expect(headers.get("x-request-id")).toBeTruthy();
    expect(headers.has("x-organization-id")).toBe(false);
    expect(headers.has("x-dms-persona")).toBe(false);
  });

  it("passes the archive scope as a server-side list filter", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 50 }), { status: 200, headers: { "content-type": "application/json" } }));
    await dmsApi.list({ archiveState: "ARCHIVED", pageSize: 50 });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("archiveState=ARCHIVED");
  });

  it("passes only the selected server-whitelisted sort parameters", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 50 }), { status: 200, headers: { "content-type": "application/json" } }));
    await dmsApi.list({ sortBy: "documentDate", sortOrder: "asc", pageSize: 50 });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("sortBy=documentDate");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("sortOrder=asc");
  });

  it("passes document-date bounds only as list query filters", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 50 }), { status: 200, headers: { "content-type": "application/json" } }));
    await dmsApi.list({ documentDateFrom: "2026-01-01", documentDateTo: "2026-01-31", pageSize: 50 });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("documentDateFrom=2026-01-01");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("documentDateTo=2026-01-31");
  });

  it("passes the caller-only processor scope as a list query filter", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 50 }), { status: 200, headers: { "content-type": "application/json" } }));
    await dmsApi.list({ processorScope: "ME", pageSize: 50 });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("processorScope=ME");
  });

  it("loads the server-scoped work queue without client-side organization input", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ processing: 1, approvals: 0, incoming: 2, dueSoon: 1 }), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(dmsApi.workQueue()).resolves.toMatchObject({ processing: 1, incoming: 2 });
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/\/work-queue$/);
  });

  it("passes report dimensions only as query filters", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ groups: [], total: 0 }), { status: 200, headers: { "content-type": "application/json" } }));
    await dmsApi.report({ direction: "OUTGOING", state: "ISSUED", documentType: "CONG_VAN" });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("direction=OUTGOING");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("state=ISSUED");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("documentType=CONG_VAN");
  });

  it("uses the scoped template-administration endpoints for lifecycle changes", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } }));
    await dmsApi.adminTemplates("org-1", "mẫu đi");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/admin/templates?organizationId=org-1&search=m%E1%BA%ABu+%C4%91i");
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: "template-1", status: "INACTIVE" }), { status: 200, headers: { "content-type": "application/json" } }));
    await dmsApi.changeTemplateStatus("template-1", "INACTIVE");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/admin/templates/template-1");
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("PATCH");
  });
});
