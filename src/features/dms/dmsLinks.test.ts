import { expect, it } from "vitest";
import { dmsDocumentId, dmsNotificationDocumentId } from "./dmsLinks";
it("only accepts canonical document notification destinations matching the target", () => {
  const id = "33333333-3333-4333-8333-333333333333";
  const notification = { type: "SYSTEM", targetId: id, metadata: { deepLink: `hacomchat://documents/${id}` } };
  expect(dmsNotificationDocumentId(notification)).toBe(id);
  for (const deepLink of [`https://evil.test/${id}`, `hacomchat://documents/${id}?redirect=evil`, `hacomchat://documents/44444444-4444-4444-8444-444444444444`]) {
    expect(dmsNotificationDocumentId({ ...notification, metadata: { deepLink } })).toBeUndefined();
  }
  expect(dmsNotificationDocumentId({ ...notification, type: "MENTIONED_IN_MESSAGE" })).toBeUndefined();
  expect(dmsDocumentId("../files")).toBeNull();
  expect(dmsDocumentId(null)).toBeNull();
});
