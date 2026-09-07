import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ActionPanel } from "./DocumentWorkspace";
import { dmsApi, DmsApiError, type DmsDocument } from "./dmsApi";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(() => vi.restoreAllMocks());

const document = { id: "document-1", direction: "INTERNAL", organization_id: "organization-1", subject: "Subject", created_by_subject_id: "subject-1", document_type: "NOTICE", document_number: null, document_date: null, due_date: null, confidentiality: "NORMAL", lifecycle_state: "DRAFT", approval_state: "NOT_REQUIRED", distribution_state: "NOT_DISTRIBUTED", signing_state: "NOT_REQUIRED", archive_state: "ACTIVE", revision: 1, updated_at: "2026-09-06T00:00:00.000Z" } as DmsDocument;

it("announces a workflow lookup failure instead of leaving the action form silently empty", async () => {
  vi.spyOn(dmsApi, "workflows").mockRejectedValue(new DmsApiError(503, "DMS_UNAVAILABLE"));
  render(<ActionPanel document={document} mode="submit" onClose={() => {}} onDone={() => {}} />);
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("errors.unavailable"));
});
