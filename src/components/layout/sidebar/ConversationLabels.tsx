import React, { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  Bars3Icon,
  ChevronDownIcon,
  CheckIcon,
  EllipsisHorizontalIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button, IconButton, Modal } from "../../ui";
import {
  type ConversationLabel,
  useUIStore,
} from "../../../stores/uiStore";
import type { ChatLayoutState } from "../../../utils/densityPolicy";

const LABEL_SWATCHES = [
  "#e31b23",
  "#e11dca",
  "#f97316",
  "#f5b700",
  "#45c776",
  "#0b74ff",
  "#24324b",
];

const SKIP_MARK_READ_CONFIRM_KEY = "chat.sidebar.skipMarkReadConfirm";

export const ConversationLabelMarker: React.FC<{
  color: string;
  className?: string;
}> = ({ color, className }) => (
  <span
    className={clsx("inline-block h-3.5 w-5 shrink-0", className)}
    style={{
      backgroundColor: color,
      clipPath: "polygon(0 0, 78% 0, 100% 50%, 78% 100%, 0 100%)",
    }}
    aria-hidden="true"
  />
);

export const ConversationLabelChips: React.FC<{
  labels: ConversationLabel[];
  max?: number;
}> = ({ labels, max = 2 }) => {
  if (labels.length === 0) return null;

  const visibleLabels = labels.slice(0, max);
  const overflow = labels.length - visibleLabels.length;

  return (
    <span className="flex min-w-0 items-center gap-1">
      {visibleLabels.map((label) => (
        <ConversationLabelMarker
          key={label.id}
          color={label.color}
          className="h-2.5 w-4"
        />
      ))}
      {overflow > 0 ? (
        <span className="text-[10px] font-medium text-text-muted">
          +{overflow}
        </span>
      ) : null}
    </span>
  );
};

const useCloseOnOutside = (
  open: boolean,
  refs: React.RefObject<HTMLElement | null>[],
  onClose: () => void,
) => {
  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      if (refs.some((ref) => ref.current?.contains(target))) {
        return;
      }

      onClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open, refs]);
};

export const SidebarLabelFilter: React.FC<{
  layoutState: ChatLayoutState;
  onMarkVisibleRead: () => void | Promise<void>;
}> = ({ layoutState, onMarkVisibleRead }) => {
  const { t } = useTranslation();
  const labels = useUIStore((state) => state.conversationLabels);
  const selectedLabelIds = useUIStore(
    (state) => state.selectedConversationLabelIds,
  );
  const setSelectedLabelIds = useUIStore(
    (state) => state.setSelectedConversationLabelIds,
  );
  const clearSelectedLabels = useUIStore(
    (state) => state.clearSelectedConversationLabels,
  );
  const openManager = useUIStore(
    (state) => state.openConversationLabelManager,
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [confirmMarkReadOpen, setConfirmMarkReadOpen] = useState(false);
  const [skipMarkReadConfirm, setSkipMarkReadConfirm] = useState(false);
  const filterButtonRef = useRef<HTMLButtonElement | null>(null);
  const filterMenuRef = useRef<HTMLDivElement | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const isDense = layoutState !== "normal";

  useCloseOnOutside(
    filterOpen,
    [filterButtonRef, filterMenuRef],
    () => setFilterOpen(false),
  );
  useCloseOnOutside(
    moreOpen,
    [moreButtonRef, moreMenuRef],
    () => setMoreOpen(false),
  );

  const selectedLabels = useMemo(
    () => labels.filter((label) => selectedLabelIds.includes(label.id)),
    [labels, selectedLabelIds],
  );

  const toggleFilterLabel = (labelId: string) => {
    setSelectedLabelIds(
      selectedLabelIds.includes(labelId)
        ? selectedLabelIds.filter((id) => id !== labelId)
        : [...selectedLabelIds, labelId],
    );
  };

  const shouldSkipMarkReadConfirm = () =>
    typeof localStorage !== "undefined" &&
    localStorage.getItem(SKIP_MARK_READ_CONFIRM_KEY) === "true";

  const requestMarkVisibleRead = () => {
    setMoreOpen(false);
    if (shouldSkipMarkReadConfirm()) {
      void onMarkVisibleRead();
      return;
    }

    setSkipMarkReadConfirm(false);
    setConfirmMarkReadOpen(true);
  };

  const confirmMarkVisibleRead = () => {
    if (skipMarkReadConfirm && typeof localStorage !== "undefined") {
      localStorage.setItem(SKIP_MARK_READ_CONFIRM_KEY, "true");
    }
    setConfirmMarkReadOpen(false);
    void onMarkVisibleRead();
  };

  return (
    <div className="relative flex shrink-0 items-center gap-1">
      <button
        ref={filterButtonRef}
        type="button"
        onClick={() => {
          setMoreOpen(false);
          setFilterOpen((open) => !open);
        }}
        className={clsx(
          "inline-flex min-w-0 items-center justify-center gap-1.5 rounded-md font-medium transition-micro",
          "text-[#1565C0] hover:bg-[#1976D2]/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1976D2]/25",
          selectedLabelIds.length > 0 && "bg-[#1976D2]/10",
          isDense ? "h-8 px-2 text-[12px]" : "h-9 px-2.5 text-[12px]",
        )}
        aria-label={t("sidebar:labels.filter")}
        aria-haspopup="menu"
        aria-expanded={filterOpen}
      >
        <span className="max-w-[5rem] truncate">
          {selectedLabels.length === 1
            ? selectedLabels[0].name
            : t("sidebar:labels.filter")}
        </span>
        {selectedLabelIds.length > 1 ? (
          <span className="rounded-full bg-[#1976D2]/12 px-1.5 text-[10px] font-semibold">
            {selectedLabelIds.length}
          </span>
        ) : null}
        <ChevronDownIcon className="h-3.5 w-3.5 shrink-0" />
      </button>

      <button
        ref={moreButtonRef}
        type="button"
        onClick={() => {
          setFilterOpen(false);
          setMoreOpen((open) => !open);
        }}
        className={clsx(
          "inline-flex items-center justify-center rounded-md text-text-secondary transition-micro",
          "hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
          isDense ? "h-8 w-8" : "h-9 w-9",
        )}
        aria-label={t("sidebar:labels.more")}
        aria-haspopup="menu"
        aria-expanded={moreOpen}
      >
        <EllipsisHorizontalIcon className="h-5 w-5" />
      </button>

      {filterOpen ? (
        <div
          ref={filterMenuRef}
          role="menu"
          className="absolute right-0 top-full z-dropdown mt-2 w-72 overflow-hidden rounded-lg border border-border bg-surface shadow-elev3"
        >
          <div className="border-b border-border/70 px-3 py-2 text-sm font-medium text-text-primary">
            {t("sidebar:labels.filterTitle")}
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {labels.map((label) => {
              const checked = selectedLabelIds.includes(label.id);
              return (
                <button
                  key={label.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={checked}
                  onClick={() => toggleFilterLabel(label.id)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-text-primary transition-micro hover:bg-surface-hover"
                >
                  <span
                    className={clsx(
                      "flex h-5 w-5 items-center justify-center rounded border-2",
                      checked
                        ? "border-[#1565C0] bg-[#1565C0]"
                        : "border-border bg-surface",
                    )}
                  >
                    {checked ? (
                      <span className="h-2 w-2 rounded-full bg-white" />
                    ) : null}
                  </span>
                  <ConversationLabelMarker color={label.color} />
                  <span className="min-w-0 flex-1 truncate">{label.name}</span>
                </button>
              );
            })}
          </div>
          <div className="border-t border-border/70">
            {selectedLabelIds.length > 0 ? (
              <button
                type="button"
                onClick={clearSelectedLabels}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-text-secondary transition-micro hover:bg-surface-hover hover:text-text-primary"
              >
                <XMarkIcon className="h-4 w-4" />
                {t("sidebar:labels.clearFilter")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setFilterOpen(false);
                openManager();
              }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-[#1565C0] transition-micro hover:bg-[#1976D2]/8"
            >
              <PencilSquareIcon className="h-4 w-4" />
              {t("sidebar:labels.manage")}
            </button>
          </div>
        </div>
      ) : null}

      {moreOpen ? (
        <div
          ref={moreMenuRef}
          role="menu"
          className="absolute right-0 top-full z-dropdown mt-2 w-48 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-elev3"
        >
          <button
            type="button"
            role="menuitem"
            onClick={requestMarkVisibleRead}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-text-primary transition-micro hover:bg-surface-hover"
          >
            <CheckIcon className="h-4 w-4 text-text-secondary" />
            {t("sidebar:labels.markRead")}
          </button>
        </div>
      ) : null}

      <Modal
        isOpen={confirmMarkReadOpen}
        onClose={() => setConfirmMarkReadOpen(false)}
        title={t("sidebar:labels.confirmTitle")}
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setConfirmMarkReadOpen(false)}
            >
              {t("sidebar:labels.confirmNo")}
            </Button>
            <Button
              type="button"
              variant="brand"
              onClick={confirmMarkVisibleRead}
            >
              {t("common:actions.confirm")}
            </Button>
          </div>
        }
      >
        <p className="text-sm leading-6 text-text-secondary">
          {t("sidebar:labels.confirmMarkReadMessage")}
        </p>
        <label className="mt-5 flex cursor-pointer items-center gap-3 text-sm text-text-secondary">
          <span
            className={clsx(
              "flex h-5 w-5 items-center justify-center rounded border-2 transition-micro",
              skipMarkReadConfirm
                ? "border-[#1565C0] bg-[#1565C0]"
                : "border-border bg-surface",
            )}
          >
            {skipMarkReadConfirm ? (
              <CheckIcon className="h-3.5 w-3.5 text-white" />
            ) : null}
          </span>
          <input
            type="checkbox"
            className="sr-only"
            checked={skipMarkReadConfirm}
            onChange={(event) => setSkipMarkReadConfirm(event.target.checked)}
          />
          {t("sidebar:labels.doNotShowAgain")}
        </label>
      </Modal>
    </div>
  );
};

export const ConversationLabelManagerModal: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useUIStore((state) => state.isConversationLabelManagerOpen);
  const onClose = useUIStore((state) => state.closeConversationLabelManager);
  const labels = useUIStore((state) => state.conversationLabels);
  const addLabel = useUIStore((state) => state.addConversationLabel);
  const updateLabel = useUIStore((state) => state.updateConversationLabel);
  const deleteLabel = useUIStore((state) => state.deleteConversationLabel);
  const restoreDefaults = useUIStore(
    (state) => state.restoreDefaultConversationLabels,
  );
  const [draftName, setDraftName] = useState("");
  const [draftColor, setDraftColor] = useState(LABEL_SWATCHES[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const handleClose = () => {
    setDraftName("");
    setDraftColor(LABEL_SWATCHES[0]);
    setEditingId(null);
    setEditingName("");
    onClose();
  };

  const handleAddLabel = () => {
    if (!draftName.trim()) return;
    addLabel(draftName, draftColor);
    setDraftName("");
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="lg"
      title={t("sidebar:labels.managerTitle")}
      bodyClassName="space-y-5"
    >
      <section>
        <p className="mb-3 text-sm font-medium text-text-primary">
          {t("sidebar:labels.managerList")}
        </p>

        <div className="space-y-2">
          {labels.map((label) => {
            const editing = editingId === label.id;
            return (
              <div
                key={label.id}
                className="grid min-h-14 grid-cols-[auto,1fr,auto] items-center gap-3 rounded-md bg-surface-overlay px-3 py-2"
              >
                <Bars3Icon className="h-4 w-4 text-text-muted" />
                <div className="flex min-w-0 items-center gap-3">
                  <ConversationLabelMarker color={label.color} />
                  {editing ? (
                    <input
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          updateLabel(label.id, { name: editingName });
                          setEditingId(null);
                        }
                      }}
                      className="input-surface min-h-9 min-w-0 flex-1 px-3 text-sm"
                      aria-label={t("sidebar:labels.editName")}
                    />
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
                      {label.name}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {editing ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="brand-outline"
                      onClick={() => {
                        updateLabel(label.id, { name: editingName });
                        setEditingId(null);
                      }}
                    >
                      {t("common:actions.save")}
                    </Button>
                  ) : (
                    <IconButton
                      type="button"
                      size="sm"
                      variant="ghost"
                      icon={<PencilSquareIcon className="h-4 w-4" />}
                      aria-label={t("sidebar:labels.editName")}
                      onClick={() => {
                        setEditingId(label.id);
                        setEditingName(label.name);
                      }}
                    />
                  )}
                  <IconButton
                    type="button"
                    size="sm"
                    variant="ghost"
                    icon={<TrashIcon className="h-4 w-4" />}
                    aria-label={t("sidebar:labels.delete")}
                    onClick={() => deleteLabel(label.id)}
                    className="text-danger hover:text-danger"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-md border border-border/70 p-3">
        <label className="mb-2 block text-sm font-medium text-text-primary">
          {t("sidebar:labels.add")}
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                handleAddLabel();
              }
            }}
            placeholder={t("sidebar:labels.addPlaceholder")}
            className="input-surface min-h-10 min-w-0 flex-1 px-3 text-sm"
          />
          <div className="flex shrink-0 items-center gap-1">
            {LABEL_SWATCHES.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setDraftColor(color)}
                className={clsx(
                  "h-7 w-7 rounded-md border transition-micro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1976D2]/25",
                  draftColor === color
                    ? "border-[#1565C0] ring-2 ring-[#1976D2]/20"
                    : "border-border",
                )}
                style={{ backgroundColor: color }}
                aria-label={color}
              />
            ))}
          </div>
          <Button
            type="button"
            variant="brand"
            size="sm"
            leftIcon={<PlusIcon className="h-4 w-4" />}
            onClick={handleAddLabel}
            disabled={!draftName.trim()}
          >
            {t("common:actions.add")}
          </Button>
        </div>
      </section>

      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={restoreDefaults}>
          {t("sidebar:labels.restoreDefaults")}
        </Button>
      </div>
    </Modal>
  );
};
