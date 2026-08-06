import { describe, expect, it } from "vitest";
import { MessageType, UserStatus, type UserSummary } from "../../../types";
import type { CloudItem } from "../types";
import {
  cloudItemToMessage,
  cloudItemsToMessages,
} from "./cloudMessageAdapter";

const currentUser: UserSummary = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "cloud.demo",
  displayName: "Cloud Demo",
  avatar: "",
  status: UserStatus.ONLINE,
  isBot: false,
};

const createItem = (updates: Partial<CloudItem>): CloudItem => ({
  id: "22222222-2222-4222-8222-222222222222",
  type: "text",
  status: "ready",
  content: "Ghi ch?",
  sizeBytes: 8,
  createdAt: "2026-07-30T01:00:00.000Z",
  updatedAt: "2026-07-30T01:00:00.000Z",
  ...updates,
});

describe("cloud message adapter", () => {
  it("maps links without calling Chat's link-preview API", () => {
    const message = cloudItemToMessage(
      createItem({
        type: "link",
        title: "Hacom",
        url: "https://hacom.vn",
      }),
      currentUser,
      { link: "Li?n k?t", file: "T?p" },
    );

    expect(message.type).toBe(MessageType.TEXT);
    expect(message.content).toBe("https://hacom.vn");
    expect(message.metadata?.linkPreview).toMatchObject({
      url: "https://hacom.vn",
      title: "Hacom",
    });
    expect(message.senderId).toBe(currentUser.id);
  });

  it("maps ready Cloud images to native inline image messages", () => {
    const message = cloudItemToMessage(
      createItem({
        type: "image",
        title: "photo.png",
        accessUrl: "/cloud-object/bucket/photo.png?signed=1",
        contentType: "image/png",
      }),
      currentUser,
      { link: "Liên kết", file: "Tệp" },
    );

    expect(message.type).toBe(MessageType.IMAGE);
    expect(message.attachments?.[0]).toMatchObject({
      type: "image",
      fileName: "photo.png",
      mimeType: "image/png",
      url: "/cloud-object/bucket/photo.png?signed=1",
      thumbnailUrl: "/cloud-object/bucket/photo.png?signed=1",
    });
  });

  it("maps Cloud recordings to native voice/audio bubbles instead of files", () => {
    const message = cloudItemToMessage(
      createItem({
        type: "audio",
        title: "voice-recording.webm",
        accessUrl: "http://localhost:5100/cloud-object/voice.webm?signed=1",
        contentType: "audio/webm",
      }),
      currentUser,
      { link: "Liên kết", file: "Tệp" },
    );

    expect(message.type).toBe(MessageType.AUDIO);
    expect(message.attachments?.[0]).toMatchObject({
      type: "audio",
      mimeType: "audio/webm",
      url: "http://localhost:5100/cloud-object/voice.webm?signed=1",
    });
  });

  it("keeps Cloud videos as playable video messages for the native timeline", () => {
    const message = cloudItemToMessage(
      createItem({
        type: "video",
        title: "demo.mp4",
        accessUrl: "http://localhost:5100/cloud-object/demo.mp4?signed=1",
        contentType: "video/mp4",
      }),
      currentUser,
      { link: "Liên kết", file: "Tệp" },
    );

    expect(message.type).toBe(MessageType.VIDEO);
    expect(message.attachments?.[0]).toMatchObject({
      type: "video",
      mimeType: "video/mp4",
      url: "http://localhost:5100/cloud-object/demo.mp4?signed=1",
    });
  });

  it("orders Cloud items chronologically for the native chat timeline", () => {
    const newer = createItem({
      id: "33333333-3333-4333-8333-333333333333",
      createdAt: "2026-07-30T02:00:00.000Z",
    });
    const older = createItem({
      id: "44444444-4444-4444-8444-444444444444",
      createdAt: "2026-07-30T00:00:00.000Z",
    });

    const messages = cloudItemsToMessages([newer, older], currentUser, {
      link: "Li?n k?t",
      file: "T?p",
    });

    expect(messages.map((message) => message.id)).toEqual([
      older.id,
      newer.id,
    ]);
  });
});
