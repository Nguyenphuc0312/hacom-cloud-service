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

// contentFormat, plainText, mentions, and replyToMessage extensions are
// owned by the client-side Message type in src/types/index.ts.
// They are intentionally not augmented here to avoid TS2717 conflicts when
// @hacom/chat-shared-types adds these fields with a narrower type definition.
