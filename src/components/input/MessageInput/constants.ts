import {
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import type { ComposerVisualState, ComposerVisualStyles } from "./types";

export const compactStatusToneClasses = {
  info: "border-sky-200 bg-sky-50 text-sky-800",
  warn: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-rose-200 bg-rose-50 text-rose-800",
} as const;

export const compactStatusToneIcons = {
  info: InformationCircleIcon,
  warn: ExclamationTriangleIcon,
  error: XCircleIcon,
} as const;

export const COMPOSER_VISUAL_STATE_MAP: Record<
  ComposerVisualState,
  ComposerVisualStyles
> = {
  idle: {
    shell: "border-border/80 bg-surface/50 dark:bg-white/5 shadow-sm",
    attachmentButton:
      "text-text-muted hover:bg-surface-hover hover:text-text-primary",
    attachmentDivider: "border-border/40",
  },
  focus: {
    shell:
      "border-primary/26 bg-[hsl(var(--chat-panel-bg))] shadow-none ring-1 ring-primary/12",
    attachmentButton:
      "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
    attachmentDivider: "border-border/40",
  },
  "ready-to-send": {
    shell:
      "border-primary/22 bg-[hsl(var(--chat-panel-bg))] shadow-none ring-1 ring-primary/10",
    attachmentButton:
      "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
    attachmentDivider: "border-border/35",
  },
  uploading: {
    shell:
      "border-primary/20 bg-[hsl(var(--chat-panel-bg))] shadow-none ring-1 ring-primary/10",
    attachmentButton:
      "text-primary hover:bg-primary/8 hover:text-primary-hover",
    attachmentDivider: "border-border/35",
  },
  disabled: {
    shell: "border-transparent bg-disabled-bg shadow-none",
    attachmentButton: "text-text-disabled",
    attachmentDivider: "border-transparent",
  },
  "slow-mode": {
    shell:
      "border-warning/35 bg-[hsl(var(--chat-panel-bg))] shadow-none ring-1 ring-warning/10",
    attachmentButton: "text-warning hover:bg-warning/10 hover:text-warning",
    attachmentDivider: "border-warning/18",
  },
  offline: {
    shell:
      "border-danger/28 bg-[hsl(var(--chat-panel-bg))] shadow-none ring-1 ring-danger/10",
    attachmentButton: "text-danger hover:bg-danger/10 hover:text-danger",
    attachmentDivider: "border-danger/18",
  },
};
