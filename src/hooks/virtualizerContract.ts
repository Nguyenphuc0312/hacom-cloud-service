export type ConversationVirtualizerAlign =
  | "auto"
  | "start"
  | "center"
  | "end";

export interface ConversationVirtualizerOffsetMatch {
  index: number;
  offsetWithinItem: number;
}

export interface ConversationVirtualizerMeasurementResult {
  changed: boolean;
  previousSize: number;
  nextSize: number;
  delta: number;
}

export interface ConversationVirtualItem {
  key: string | number | bigint;
  index: number;
  start: number;
  size: number;
  end: number;
}
