import { DMS_API_BASE_URL } from "../../config";
import { clearDmsAccessToken, getDmsAccessToken } from "./dmsOAuth";

export type DmsDirection = "INCOMING" | "OUTGOING" | "INTERNAL";
export type DmsPrincipal = {
  subjectId: string;
  employeeId: string;
  employeeCode: string;
  organizationIds: string[];
  capabilities: string[];
  permissionVersion: number;
};
export type DmsDocument = {
  id: string;
  direction: DmsDirection;
  organization_id: string;
  subject: string;
  created_by_subject_id: string;
  document_type: string;
  document_number: string | null;
  document_date: string | null;
  due_date: string | null;
  confidentiality: "NORMAL" | "CONFIDENTIAL" | "SECRET";
  lifecycle_state: string;
  approval_state: string;
  distribution_state: string;
  signing_state: string;
  archive_state: string;
  revision: number;
  updated_at: string;
  files?: DmsFile[];
  history?: DmsHistory[];
  access?: { history: boolean };
  tasks?: DmsTask[];
  versions?: Array<{ id: string; version: number; metadata: Record<string, unknown>; created_at: string; template_code_snapshot: string | null; template_name_snapshot: string | null; template_version_number: number | null }>;
};
export type DmsFile = { id: string; filename: string; content_type: string; content_length: number; file_role: string; integrity_state: string };
export type DmsHistory = { id: string; action: string; result: string; reason_code: string | null; metadata: Record<string, unknown>; occurred_at: string };
export type DmsTask = { id: string; assignee_subject_id: string; role: string; state: string; revision: number; due_at: string | null; started_at: string | null };
export type DmsList = { items: DmsDocument[]; total: number; page: number; pageSize: number };
export type DmsWorkQueue = { processing: number; approvals: number; incoming: number; dueSoon: number };
export type DmsOrganizationMember = { subjectId: string; employeeCode: string; displayName: string };

export class DmsApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const token = getDmsAccessToken();
  if (!token) throw new DmsApiError(401, "DMS_AUTH_REQUIRED");
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  headers.set("x-request-id", crypto.randomUUID());
  if (init.body && !(init.body instanceof Blob) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (init.method && init.method !== "GET") headers.set("idempotency-key", crypto.randomUUID());
  const response = await fetch(`${DMS_API_BASE_URL}${path}`, { ...init, headers });
  if (response.status === 401) clearDmsAccessToken();
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { code?: unknown };
    throw new DmsApiError(response.status, typeof payload.code === "string" ? payload.code : "DMS_REQUEST_FAILED");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
};

const query = (values: Record<string, string | number | null | undefined>): string => {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") params.set(key, String(value));
  });
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
};

export const dmsApi = {
  organizationMembers: (organizationId: string, search: string, signal: AbortSignal) => request<{ items: DmsOrganizationMember[] }>(`/organization-members${query({ organizationId, query: search })}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) }),
  principal: () => request<DmsPrincipal>("/principal"),
  workQueue: () => request<DmsWorkQueue>("/work-queue"),
  list: (filters: Record<string, string | number | null | undefined>) => request<DmsList>(`/documents${query(filters)}`),
  detail: (id: string) => request<DmsDocument>(`/documents/${encodeURIComponent(id)}`),
  create: (body: Record<string, unknown>) => request<{ id: string }>("/documents", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: Record<string, unknown>) => request(`/documents/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }),
  action: (id: string, action: string, body: Record<string, unknown> = {}) => request(`/documents/${encodeURIComponent(id)}/${action}`, { method: "POST", body: JSON.stringify(body) }),
  task: (id: string, action: "start" | "complete", revision: number) => request(`/tasks/${encodeURIComponent(id)}/${action}`, { method: "POST", body: JSON.stringify({ revision }) }),
  upload: async (documentId: string, file: File): Promise<unknown> => {
    const checksum = base64ToHex(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
    return request(`/documents/${encodeURIComponent(documentId)}/files`, {
      method: "POST",
      headers: { "content-type": file.type, "x-file-name": file.name, "x-file-role": "MAIN", "x-checksum-sha256": checksum },
      body: file,
    });
  },
  file: async (documentId: string, fileId: string, download = false, signal?: AbortSignal): Promise<Blob> => {
    const token = getDmsAccessToken();
    if (!token) throw new DmsApiError(401, "DMS_AUTH_REQUIRED");
    const timeout = AbortSignal.timeout(20_000);
    const response = await fetch(`${DMS_API_BASE_URL}/documents/${encodeURIComponent(documentId)}/files/${encodeURIComponent(fileId)}${download ? "?download=true" : ""}`, { headers: { authorization: `Bearer ${token}`, "x-request-id": crypto.randomUUID() }, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    if (!response.ok) throw new DmsApiError(response.status, "DMS_FILE_UNAVAILABLE");
    return response.blob();
  },
  report: (filters: { from?: string; to?: string; direction?: string; state?: string; documentType?: string } = {}) => request<{ groups: Array<{ direction: string; lifecycle_state: string; count: number }>; total: number }>(`/reports/summary${query(filters)}`),
  templates: (organizationId: string) => request<unknown[]>(`/templates${query({ organizationId })}`),
  adminTemplates: (organizationId: string, search?: string) => request<unknown[]>(`/admin/templates${query({ organizationId, search })}`),
  books: (organizationId: string, direction?: string) => request<unknown[]>(`/document-books${query({ organizationId, direction })}`),
  workflows: (organizationId: string) => request<unknown[]>(`/workflows${query({ organizationId })}`),
  catalogs: (organizationId: string, catalogType?: string) => request<unknown[]>(`/catalogs${query({ organizationId, catalogType })}`),
  createTemplate: (body: Record<string, unknown>) => request("/admin/templates", { method: "POST", body: JSON.stringify(body) }),
  changeTemplateStatus: (id: string, status: "ACTIVE" | "INACTIVE" | "ARCHIVED") => request(`/admin/templates/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  createBook: (body: Record<string, unknown>) => request("/admin/document-books", { method: "POST", body: JSON.stringify(body) }),
  createWorkflow: (body: Record<string, unknown>) => request("/admin/workflows", { method: "POST", body: JSON.stringify(body) }),
  upsertCatalog: (body: Record<string, unknown>) => request("/admin/catalogs", { method: "POST", body: JSON.stringify(body) }),
};

const base64ToHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
