/**
 * Local augmentations for @hacom/chat-shared-types.
 *
 * These fields are returned by the production API but have not yet been
 * promoted into the shared-types package contract. They are declared here as
 * optional so that the rest of the app can reference them without TS errors,
 * while remaining backward-compatible with consumers that receive messages
 * without these fields.
 *
 * Remove this file once the fields land in @hacom/chat-shared-types.
 */

// The side-effect-free import anchors this augmentation to the resolved
// module so TypeScript can match the declaration to the correct package.
import type {} from "@hacom/chat-shared-types";

declare module "@hacom/chat-shared-types" {
  interface Message {
    /** Content format hint returned by the API. Defaults to "plain_text". */
    contentFormat?: "plain_text" | "markdown" | "rich_text";
    /** Pre-extracted plain-text version of rich/markdown content. */
    plainText?: string;
  }

  interface MessageSummary {
    /** Content format hint — needed for reply preview rendering. */
    contentFormat?: "plain_text" | "markdown" | "rich_text";
  }
}
