import React, { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { MagnifyingGlassIcon, UserIcon } from "@heroicons/react/24/outline";
import { Modal, Input, Button, Spinner } from "../ui";
import { Avatar } from "../common/Avatar";
import { useDebounce } from "../../hooks/useDebounce";
import { extractApiError, unwrapApiSuccess } from "../../lib/apiContract";
import type { PublicUserSummary } from "@hacom/chat-shared-types/auth";
import { searchUsersUseCase } from "../../features/chat/usecases/searchUsers";

type TabKey = "my" | "choose";

interface ShareContactModalProps {
  isOpen: boolean;
  currentUserId: string;
  onClose: () => void;
  onShare: (contactUserId: string) => Promise<void>;
  className?: string;
}

const extractSearchUsers = (payload: unknown): PublicUserSummary[] => {
  if (Array.isArray(payload)) return payload as PublicUserSummary[];

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.data)) {
      return record.data as PublicUserSummary[];
    }
    if (record.data && typeof record.data === "object") {
      const nested = record.data as Record<string, unknown>;
      if (Array.isArray(nested.data)) {
        return nested.data as PublicUserSummary[];
      }
    }
  }

  return [];
};

export const ShareContactModal: React.FC<ShareContactModalProps> = ({
  isOpen,
  currentUserId,
  onClose,
  onShare,
  className,
}) => {
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<TabKey>("my");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicUserSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sendingUserId, setSendingUserId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const debouncedQuery = useDebounce(query, 300);

  const tabs: Array<{ id: TabKey; label: string }> = useMemo(
    () => [
      {
        id: "my",
        label: t("chat:contactShare.myContact", { defaultValue: "My contact" }),
      },
      {
        id: "choose",
        label: t("chat:contactShare.chooseContact", {
          defaultValue: "Choose contact",
        }),
      },
    ],
    [t],
  );

  const runSearch = useCallback(async (rawQuery: string) => {
    if (!rawQuery.trim() || rawQuery.trim().length < 2) {
      setResults([]);
      setErrorText(null);
      return;
    }

    setIsLoading(true);
    setErrorText(null);
    try {
      const response = await searchUsersUseCase(rawQuery.trim(), 1, 20);
      const payload = unwrapApiSuccess(response);
      setResults(extractSearchUsers(payload));
    } catch (error) {
      const apiError = extractApiError(error);
      setResults([]);
      setErrorText(apiError.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    if (activeTab !== "choose") return;
    void runSearch(debouncedQuery);
  }, [activeTab, debouncedQuery, isOpen, runSearch]);

  useEffect(() => {
    if (!isOpen) {
      setActiveTab("my");
      setQuery("");
      setResults([]);
      setIsLoading(false);
      setSendingUserId(null);
      setErrorText(null);
    }
  }, [isOpen]);

  const handleShare = useCallback(
    async (contactUserId: string) => {
      if (!contactUserId) return;
      setSendingUserId(contactUserId);
      try {
        await onShare(contactUserId);
        onClose();
      } finally {
        setSendingUserId(null);
      }
    },
    [onClose, onShare],
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title={t("chat:contactShare.title", { defaultValue: "Share contact" })}
      description={t("chat:contactShare.description", {
        defaultValue: "Choose a contact card to share",
      })}
      contentClassName={className}
    >
      <div className="space-y-4">
        <div className="flex items-center rounded-xl bg-surface-overlay p-1">
          {tabs.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-surface text-text-primary shadow-xs"
                    : "text-text-muted hover:text-text-primary",
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === "my" && (
          <div className="rounded-xl border border-border bg-surface-raised p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-primary/10 p-2 text-primary">
                <UserIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-text-primary">
                  {t("chat:contactShare.shareMyCard", {
                    defaultValue: "Share my contact card",
                  })}
                </p>
                <p className="text-xs text-text-muted">
                  {t("chat:contactShare.privacyNote", {
                    defaultValue:
                      "Visible fields are controlled by your privacy settings.",
                  })}
                </p>
              </div>
            </div>
            <Button
              type="button"
              className="mt-4 w-full"
              isLoading={sendingUserId === currentUserId}
              onClick={() => void handleShare(currentUserId)}
            >
              {t("chat:contactShare.shareNow", { defaultValue: "Share now" })}
            </Button>
          </div>
        )}

        {activeTab === "choose" && (
          <div className="space-y-3">
            <Input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("chat:contactShare.searchPlaceholder", {
                defaultValue: "Search by username/email/phone",
              })}
              leftIcon={<MagnifyingGlassIcon className="h-5 w-5" />}
            />

            {isLoading ? (
              <div className="flex justify-center py-6">
                <Spinner size="sm" />
              </div>
            ) : errorText ? (
              <p className="text-sm text-danger">{errorText}</p>
            ) : results.length === 0 ? (
              <p className="py-4 text-center text-sm text-text-muted">
                {debouncedQuery.trim().length < 2
                  ? t("chat:contactShare.searchHint", {
                      defaultValue: "Enter at least 2 characters",
                    })
                  : t("chat:contactShare.noResults", {
                      defaultValue: "No matching users",
                    })}
              </p>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {results.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => void handleShare(item.id)}
                      disabled={Boolean(sendingUserId)}
                      className={clsx(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors",
                        "hover:bg-surface-overlay",
                        sendingUserId && "cursor-not-allowed opacity-70",
                      )}
                    >
                      <Avatar
                        src={item.avatarUrl || undefined}
                        alt={item.displayName || item.username || item.id}
                        size="md"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-text-primary">
                          {item.displayName}
                        </p>
                        {item.username && (
                          <p className="truncate text-xs text-text-muted">
                            @{item.username}
                          </p>
                        )}
                      </div>
                      <span className="text-xs font-medium text-primary">
                        {sendingUserId === item.id
                          ? t("common:loading.processing", {
                              defaultValue: "Processing...",
                            })
                          : t("chat:contactShare.shareAction", {
                              defaultValue: "Share",
                            })}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ShareContactModal;
