import { describe, expect, it } from "vitest";

import { MessageStatus } from "../types";
import type { Message } from "../types";
import {
  dedupeAndSortMessages,
  mergeDefinedMessageFields,
  mergeMessageRecords,
  mergeMessages,
  resolveMergedSendState,
} from "./messageMergeRecords";

const message = (partial: Partial<Message>): Message =>
  ({ id: "m1", ...partial }) as Message;

describe("mergeDefinedMessageFields", () => {
  it("field `undefined` của bản đến KHÔNG xoá dữ liệu đang có", () => {
    const merged = mergeDefinedMessageFields(
      message({ id: "a", content: "giữ lại" }),
      message({ id: "a", content: undefined }),
    );
    expect(merged.content).toBe("giữ lại");
  });

  it("field có giá trị thì ghi đè, kể cả giá trị rỗng/null", () => {
    const merged = mergeDefinedMessageFields(
      message({ id: "a", content: "cũ" }),
      message({ id: "a", content: "" }),
    );
    expect(merged.content).toBe("");
  });
});

describe("resolveMergedSendState", () => {
  it("server đã nhận (id thật) → 'sent'", () => {
    expect(
      resolveMergedSendState(
        message({ id: "temp-1", sendState: "sending" }),
        message({ id: "server-1" }),
      ),
    ).toBe("sent");
  });

  it("status SENT/DELIVERED/READ đều tính là đã gửi", () => {
    for (const status of [
      MessageStatus.SENT,
      MessageStatus.DELIVERED,
      MessageStatus.READ,
    ]) {
      expect(
        resolveMergedSendState(
          message({ id: "temp-1", sendState: "sending" }),
          message({ id: "temp-1", status }),
        ),
      ).toBe("sent");
    }
  });

  it("'failed' của bản đến thắng cả ack — không được nuốt lỗi", () => {
    expect(
      resolveMergedSendState(
        message({ id: "temp-1" }),
        message({ id: "server-1", sendState: "failed" }),
      ),
    ).toBe("failed");
  });

  it("bản đến không nói gì thì suy từ status của bản hiện tại", () => {
    expect(
      resolveMergedSendState(
        message({ id: "a", status: MessageStatus.SENT }),
        message({ id: "a" }),
      ),
    ).toBe("sent");
  });
});

describe("mergeMessageRecords — chống ghi đè bằng dữ liệu cũ", () => {
  it("version thấp hơn KHÔNG ghi đè bản mới", () => {
    const merged = mergeMessageRecords(
      message({ id: "a", content: "bản mới", version: 5 }),
      message({ id: "a", content: "bản cũ", version: 2 }),
    );
    expect(merged.content).toBe("bản mới");
  });

  it("version cao hơn thì được áp dụng", () => {
    const merged = mergeMessageRecords(
      message({ id: "a", content: "cũ", version: 2 }),
      message({ id: "a", content: "mới", version: 5 }),
    );
    expect(merged.content).toBe("mới");
  });

  it("version luôn tiến, không lùi", () => {
    const merged = mergeMessageRecords(
      message({ id: "a", version: 5 }),
      message({ id: "a", version: 2 }),
    );
    expect(merged.version).toBe(5);
  });

  it("ack về: id tạm được thay bằng id thật, localId giữ vết id cũ", () => {
    const merged = mergeMessageRecords(
      message({ id: "temp-1", clientMessageId: "c1" }),
      message({ id: "server-1", clientMessageId: "c1" }),
    );
    expect(merged.id).toBe("server-1");
    expect(merged.localId).toBe("temp-1");
  });

  it("id thật KHÔNG bị id tạm ghi đè (sự kiện đến trễ)", () => {
    const merged = mergeMessageRecords(
      message({ id: "server-1" }),
      message({ id: "temp-1" }),
    );
    expect(merged.id).toBe("server-1");
  });

  it("transportStatus chỉ tiến lên, không tụt", () => {
    expect(
      mergeMessageRecords(
        message({ id: "a", transportStatus: "synced_stream" }),
        message({ id: "a", transportStatus: "acked_transport" }),
      ).transportStatus,
    ).toBe("synced_stream");
  });

  it("đã gửi thành công thì xoá sạch dấu vết lỗi cũ", () => {
    const merged = mergeMessageRecords(
      message({
        id: "temp-1",
        sendState: "failed",
        failureReason: "network",
        errorCode: "E1",
        errorMessage: "hỏng",
        queuedReason: "offline",
      }),
      message({ id: "server-1", status: MessageStatus.SENT }),
    );
    expect(merged.sendState).toBe("sent");
    expect(merged.failureReason).toBeUndefined();
    expect(merged.errorCode).toBeUndefined();
    expect(merged.errorMessage).toBeUndefined();
    expect(merged.queuedReason).toBeUndefined();
  });
});

describe("dedupeAndSortMessages", () => {
  it("gộp bản trùng danh tính thay vì để hai dòng", () => {
    const result = dedupeAndSortMessages([
      message({ id: "temp-1", clientMessageId: "c1", serverSeq: 1 }),
      message({ id: "server-1", clientMessageId: "c1", serverSeq: 1 }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("server-1");
  });

  it("giữ các tin khác nhau và sắp theo thứ tự canonical", () => {
    const result = dedupeAndSortMessages([
      message({ id: "b", serverSeq: 2 }),
      message({ id: "a", serverSeq: 1 }),
    ]);
    expect(result.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("danh sách rỗng không ném lỗi", () => {
    expect(dedupeAndSortMessages([])).toEqual([]);
  });
});

describe("mergeMessages", () => {
  it("chịu được đầu vào không phải mảng", () => {
    expect(
      mergeMessages(null as never, [message({ id: "a", serverSeq: 1 })]),
    ).toHaveLength(1);
    expect(mergeMessages([message({ id: "a" })], null as never)).toHaveLength(1);
  });
});
