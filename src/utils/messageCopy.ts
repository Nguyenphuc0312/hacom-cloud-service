import type { Mention, Message } from "../types";
import { MessageType } from "../types";
import {
  shouldTreatMessageContentAsRichText,
} from "./messageContent.utils";

const NON_COPYABLE_TYPES = new Set<MessageType>([
  MessageType.SYSTEM,
  MessageType.VOICE,
  MessageType.AUDIO,
  MessageType.LOCATION,
  MessageType.STICKER,
]);

const BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "br",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "ol",
  "p",
  "pre",
  "section",
  "tr",
  "ul",
]);

const normalizeCopyText = (text: string): string | null => {
  const normalized = text
    .replace(/\u200B|\u200C|\u200D|\uFEFF/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return normalized.length > 0 ? normalized : null;
};

const stripHtmlToReadableText = (html: string): string => {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|blockquote|pre|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, "");
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style, template, meta, link").forEach((node) => {
    node.remove();
  });

  const pieces: string[] = [];
  const visit = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      pieces.push(node.textContent ?? "");
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    const before = pieces.length;
    element.childNodes.forEach(visit);

    if (BLOCK_TAGS.has(tag) && pieces.length > before) {
      pieces.push("\n");
    }
  };

  doc.body.childNodes.forEach(visit);
  return pieces.join("");
};

const replaceMentionTokens = (text: string, mentions?: Mention[]): string => {
  if (!mentions || mentions.length === 0) {
    return text;
  }

  let next = text;
  for (const mention of mentions) {
    const userId = mention.userId?.trim();
    const displayName = mention.displayName?.trim();
    if (!userId || !displayName) continue;

    const displayToken = `@${displayName}`;
    next = next
      .replaceAll(`<@${userId}>`, displayToken)
      .replaceAll(`@${userId}`, displayToken);
  }

  return next;
};

const readMessageText = (message: Message): string => {
  if (typeof message.plainText === "string" && message.plainText.trim()) {
    return message.plainText;
  }

  const content = typeof message.content === "string" ? message.content : "";
  if (!content.trim()) {
    return "";
  }

  if (
    shouldTreatMessageContentAsRichText({
      contentFormat: message.contentFormat,
      content,
    })
  ) {
    return stripHtmlToReadableText(content);
  }

  return content;
};

export const getCopyableMessageText = (message: Message): string | null => {
  if (
    message.isDeleted ||
    message.lifecycleStatus === "recalled" ||
    message.lifecycleStatus === "deleted_admin" ||
    NON_COPYABLE_TYPES.has(message.type)
  ) {
    return null;
  }

  const text = replaceMentionTokens(readMessageText(message), message.mentions);
  return normalizeCopyText(text);
};
