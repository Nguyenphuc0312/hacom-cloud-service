import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDropZone } from "./useDropZone";

const createDropEvent = (files: File[], items: DataTransferItem[]) =>
  ({
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: {
      files: files as unknown as FileList,
      items: items as unknown as DataTransferItemList,
    },
  }) as unknown as React.DragEvent;

describe("useDropZone", () => {
  it("reports a folder drop without adding a directory to the queue", () => {
    const onDrop = vi.fn();
    const onDropFolderRejected = vi.fn();
    const { result } = renderHook(() =>
      useDropZone({ onDrop, onDropFolderRejected }),
    );
    const event = createDropEvent([], [
      {
        kind: "file",
        webkitGetAsEntry: () => ({ isDirectory: true }),
      } as unknown as DataTransferItem,
    ]);

    act(() => {
      result.current.dropZoneProps.onDrop(event);
    });

    expect(onDropFolderRejected).toHaveBeenCalledTimes(1);
    expect(onDrop).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("continues to send ordinary dropped files to the shared queue", () => {
    const onDrop = vi.fn();
    const onDropFolderRejected = vi.fn();
    const file = new File(["report"], "report.pdf", {
      type: "application/pdf",
    });
    const { result } = renderHook(() =>
      useDropZone({ onDrop, onDropFolderRejected }),
    );
    const event = createDropEvent([file], [
      {
        kind: "file",
        webkitGetAsEntry: () => ({ isDirectory: false }),
      } as unknown as DataTransferItem,
    ]);

    act(() => {
      result.current.dropZoneProps.onDrop(event);
    });

    expect(onDropFolderRejected).not.toHaveBeenCalled();
    expect(onDrop).toHaveBeenCalledWith([file]);
  });
});
