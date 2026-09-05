import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DmsReport } from "./DmsReport";
import { dmsApi } from "./dmsApi";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("filters grouped reports and drills into the selected authorized result set", async () => {
  const report = vi.spyOn(dmsApi, "report").mockResolvedValue({ groups: [{ direction: "OUTGOING", lifecycle_state: "ISSUED", count: 2 }], total: 2 });
  const onDrillDown = vi.fn();
  render(<DmsReport onDrillDown={onDrillDown} />);
  await screen.findByText("directions.OUTGOING");
  fireEvent.change(screen.getByLabelText("fields.direction"), { target: { value: "OUTGOING" } });
  fireEvent.change(screen.getByLabelText("report.state"), { target: { value: "ISSUED" } });
  fireEvent.change(screen.getByLabelText("fields.documentType"), { target: { value: "CONG_VAN" } });
  fireEvent.click(screen.getByRole("button", { name: "report.run" }));
  await waitFor(() => expect(report).toHaveBeenLastCalledWith({ direction: "OUTGOING", state: "ISSUED", documentType: "CONG_VAN", from: undefined, to: undefined }));
  fireEvent.click(screen.getByRole("button", { name: "report.drillDown" }));
  expect(onDrillDown).toHaveBeenCalledWith({ direction: "OUTGOING", lifecycle_state: "ISSUED", count: 2 }, { direction: "OUTGOING", state: "ISSUED", documentType: "CONG_VAN", from: undefined, to: undefined });
});
