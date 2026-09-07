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
  expect(screen.getByRole("status").textContent).toContain("2");
  fireEvent.change(screen.getByLabelText("fields.direction"), { target: { value: "OUTGOING" } });
  fireEvent.change(screen.getByLabelText("report.state"), { target: { value: "ISSUED" } });
  fireEvent.change(screen.getByLabelText("fields.documentType"), { target: { value: "CONG_VAN" } });
  fireEvent.click(screen.getByLabelText("report.onlyMyProcessing"));
  fireEvent.click(screen.getByRole("button", { name: "report.run" }));
  await waitFor(() => expect(report).toHaveBeenLastCalledWith({ direction: "OUTGOING", state: "ISSUED", documentType: "CONG_VAN", from: undefined, to: undefined, processorScope: "ME" }));
  fireEvent.click(screen.getByRole("button", { name: "report.drillDown" }));
  expect(onDrillDown).toHaveBeenCalledWith({ direction: "OUTGOING", lifecycle_state: "ISSUED", count: 2 }, { direction: "OUTGOING", state: "ISSUED", documentType: "CONG_VAN", from: undefined, to: undefined, processorScope: "ME" });
});

it("shows export only when the server-granted capability is present", async () => {
  vi.spyOn(dmsApi, "report").mockResolvedValue({ groups: [], total: 0 });
  const onDrillDown = vi.fn();
  const { rerender } = render(<DmsReport onDrillDown={onDrillDown} />);
  expect(screen.queryByRole("button", { name: "report.export" })).toBeNull();
  rerender(<DmsReport canExport onDrillDown={onDrillDown} />);
  expect(screen.getByRole("button", { name: "report.export" })).toBeDefined();
});
