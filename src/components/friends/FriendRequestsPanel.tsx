/**
 * @fileoverview Friend Requests Panel
 *
 * Tabbed panel showing Received (pending) and Sent friend requests.
 * Received tab: accept / reject actions
 * Sent tab: cancel request action
 * Displays pending count badge on the Received tab.
 */

import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import {
  UserPlusIcon,
  PaperAirplaneIcon,
  CheckIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Spinner, toast } from "../ui";
import { Avatar } from "../common/Avatar";
import { Badge } from "../common/Badge";
import { friendshipApi } from "../../services/api";
import { useFriendship } from "../../hooks/useFriendship";
import { unwrapApiSuccess } from "../../lib/apiContract";
import { extractApiError } from "../../lib/apiContract";

type Tab = "received" | "sent";

interface FriendRequest {
  id: string;
  sender?: {
    id: string;
    username: string;
    displayName?: string;
    avatar?: string;
  };
  receiver?: {
    id: string;
    username: string;
    displayName?: string;
    avatar?: string;
  };
  createdAt: string;
}

interface FriendRequestsPanelProps {
  className?: string;
}

export const FriendRequestsPanel: React.FC<FriendRequestsPanelProps> = ({
  className,
}) => {
  const { t } = useTranslation();
  const {
    sentRequests,
    pendingCount,
    fetchSentRequests,
    fetchPendingCount,
    cancelFriendRequest,
  } = useFriendship();

  const [activeTab, setActiveTab] = useState<Tab>("received");
  const [receivedRequests, setReceivedRequests] = useState<FriendRequest[]>([]);
  const [isLoadingReceived, setIsLoadingReceived] = useState(false);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  // Fetch received (pending) requests
  const fetchReceived = useCallback(async () => {
    setIsLoadingReceived(true);
    try {
      const response = await friendshipApi.getPendingRequests();
      const payload = unwrapApiSuccess(response) as
        | FriendRequest[]
        | { data?: FriendRequest[]; requests?: FriendRequest[] };
      if (Array.isArray(payload)) {
        setReceivedRequests(payload);
      } else if (Array.isArray(payload?.data)) {
        setReceivedRequests(payload.data);
      } else if (Array.isArray(payload?.requests)) {
        setReceivedRequests(payload.requests);
      } else {
        setReceivedRequests([]);
      }
    } catch {
      // silent fail — empty state shown
    } finally {
      setIsLoadingReceived(false);
    }
  }, []);

  useEffect(() => {
    fetchReceived();
    fetchPendingCount();
    fetchSentRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = () => {
      void fetchReceived();
      void fetchPendingCount();
      void fetchSentRequests();
    };

    window.addEventListener("friend:updated", handler);
    return () => {
      window.removeEventListener("friend:updated", handler);
    };
  }, [fetchPendingCount, fetchReceived, fetchSentRequests]);

  const handleAccept = useCallback(
    async (requestId: string) => {
      setProcessingIds((prev) => new Set(prev).add(requestId));
      try {
        await friendshipApi.acceptFriendRequest(requestId);
        setReceivedRequests((prev) => prev.filter((r) => r.id !== requestId));
        fetchPendingCount();
        toast.success(t("friends:requestAccepted"));
      } catch (err) {
        const apiError = extractApiError(err);
        toast.error(apiError.message || t("friends:actionFailed"));
      } finally {
        setProcessingIds((prev) => {
          const next = new Set(prev);
          next.delete(requestId);
          return next;
        });
      }
    },
    [fetchPendingCount, t],
  );

  const handleReject = useCallback(
    async (requestId: string) => {
      setProcessingIds((prev) => new Set(prev).add(requestId));
      try {
        await friendshipApi.rejectFriendRequest(requestId);
        setReceivedRequests((prev) => prev.filter((r) => r.id !== requestId));
        fetchPendingCount();
        toast.success(t("friends:requestRejected"));
      } catch (err) {
        const apiError = extractApiError(err);
        toast.error(apiError.message || t("friends:actionFailed"));
      } finally {
        setProcessingIds((prev) => {
          const next = new Set(prev);
          next.delete(requestId);
          return next;
        });
      }
    },
    [fetchPendingCount, t],
  );

  const handleCancel = useCallback(
    async (requestId: string) => {
      try {
        await cancelFriendRequest(requestId);
        toast.success(t("friends:requestCancelled"));
      } catch {
        toast.error(t("friends:actionFailed"));
      }
    },
    [cancelFriendRequest, t],
  );

  const tabs: {
    id: Tab;
    label: string;
    icon: React.ElementType;
    count?: number;
  }[] = [
    {
      id: "received",
      label: t("friends:tabs.received"),
      icon: UserPlusIcon,
      count: pendingCount > 0 ? pendingCount : undefined,
    },
    {
      id: "sent",
      label: t("friends:tabs.sent"),
      icon: PaperAirplaneIcon,
    },
  ];

  const isLoading = activeTab === "received" ? isLoadingReceived : false;
  const items = activeTab === "received" ? receivedRequests : sentRequests;

  return (
    <div className={clsx("flex flex-col", className)}>
      {/* Tabs */}
      <div className="flex border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              "relative flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "text-primary"
                : "text-text-muted hover:text-text-secondary",
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <Badge count={tab.count} size="sm" />
            )}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size="sm" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-text-muted">
              {activeTab === "received"
                ? t("friends:sentRequests.emptyReceived")
                : t("friends:sentRequests.emptySent")}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((request) => {
              const user =
                activeTab === "received"
                  ? (request as FriendRequest).sender
                  : (request as FriendRequest).receiver;
              const isProcessing = processingIds.has(request.id);

              return (
                <li
                  key={request.id}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <Avatar
                    src={user?.avatar}
                    alt={user?.displayName || user?.username || "?"}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {user?.displayName || user?.username}
                    </p>
                    <p className="truncate text-xs text-text-muted">
                      @{user?.username}
                    </p>
                  </div>

                  {activeTab === "received" ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleAccept(request.id)}
                        disabled={isProcessing}
                        className={clsx(
                          "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                          "bg-success/15 text-success hover:bg-success/25",
                          "disabled:cursor-not-allowed disabled:opacity-50",
                        )}
                        aria-label={t("friends:accept")}
                        title={t("friends:accept")}
                      >
                        <CheckIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReject(request.id)}
                        disabled={isProcessing}
                        className={clsx(
                          "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                          "bg-danger/15 text-danger hover:bg-danger/25",
                          "disabled:cursor-not-allowed disabled:opacity-50",
                        )}
                        aria-label={t("friends:reject")}
                        title={t("friends:reject")}
                      >
                        <XMarkIcon className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleCancel(request.id)}
                      disabled={isProcessing}
                      className={clsx(
                        "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                        "text-text-muted hover:bg-surface-hover hover:text-text-secondary",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                      )}
                    >
                      {t("friends:sentRequests.cancel")}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default FriendRequestsPanel;
