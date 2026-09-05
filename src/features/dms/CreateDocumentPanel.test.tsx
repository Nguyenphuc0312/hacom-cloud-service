import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CreateDocumentPanel } from "./DocumentWorkspace";
import { dmsApi, type DmsPrincipal } from "./dmsApi";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

it("uses the supplied direction and creates an outgoing draft from the selected active template version", async () => {
  vi.spyOn(dmsApi, "templates").mockResolvedValue([{ latest_version_id: "template-v2", name: "Mẫu đi", version: 2 }]);
  const create = vi.spyOn(dmsApi, "create").mockResolvedValue({ id: "document-1" });
  const created = vi.fn();
  const principal = { organizationIds: ["organization-1"] } as DmsPrincipal;
  render(<CreateDocumentPanel principal={principal} defaultDirection="INCOMING" onClose={() => {}} onCreated={created} />);
  await screen.findByRole("option", { name: "Mẫu đi · v2" });
  expect((screen.getByLabelText("fields.direction") as HTMLSelectElement).value).toBe("INCOMING");
  fireEvent.change(screen.getByLabelText("fields.direction"), { target: { value: "OUTGOING" } });
  fireEvent.change(screen.getByLabelText("fields.template"), { target: { value: "template-v2" } });
  fireEvent.change(screen.getByLabelText("fields.documentType"), { target: { value: "THONG_BAO" } });
  fireEvent.change(screen.getByLabelText("fields.subject"), { target: { value: "Thông báo từ mẫu" } });
  fireEvent.click(screen.getByLabelText("fields.signingRequired"));
  fireEvent.click(screen.getByRole("button", { name: "actions.saveDraft" }));
  await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ direction: "OUTGOING", templateVersionId: "template-v2", signingRequired: true })));
  expect(created).toHaveBeenCalledWith("document-1");
});
