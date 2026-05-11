/**
 * Simple Virtualized Chat Timeline — flag re-exports.
 *
 * Thin wrapper around `experienceFlags` so consumers inside the
 * `simple-virtual-timeline` package import from a local module instead of
 * reaching across feature boundaries. Both readers go through the shared
 * resolver, so `__CHAT_FLAGS_OVERRIDE__` and the session kill-switch work.
 */
export {
  isChatSimpleVirtualTimelineEnabled,
  isChatSimpleTimelineDebugEnabled,
} from "../config/experienceFlags";
