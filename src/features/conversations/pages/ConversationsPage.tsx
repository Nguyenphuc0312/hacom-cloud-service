import {
  CheckOutlined,
  CopyOutlined,
  EllipsisOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Button, Empty, Input } from 'antd';
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSearchParams } from 'react-router-dom';

import { conversationsClient } from '@/api/clients';
import { queryKeys } from '@/api/queryKeys';
import type { ConversationMessage, ConversationSummary } from '@/api/types';
import { AppTooltip } from '@/components/AppTooltip';
import { IconActionButton } from '@/components/IconActionButton';
import { PageShell } from '@/components/PageShell';
import { QueryStateView } from '@/components/QueryStates';
import { formatDateTime, formatRelativeTime } from '@/utils/date';

const MESSAGE_QUERY = { limit: 200 } as const;

const reorderConversations = (
  conversations: ConversationSummary[],
  message: ConversationMessage,
): ConversationSummary[] =>
  [...conversations]
    .map((conversation) =>
      conversation.id === message.conversationId
        ? {
            ...conversation,
            preview: message.body,
            lastMessageAt: message.sentAt,
          }
        : conversation,
    )
    .sort(
      (left, right) => new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime(),
    );

const shouldClampMessage = (message: ConversationMessage) =>
  message.kind !== 'text' || message.body.length > 320 || message.body.split('\n').length > 6;

const detectBottom = (element: HTMLDivElement | null) => {
  if (!element) {
    return true;
  }

  return element.scrollHeight - element.scrollTop - element.clientHeight < 24;
};

export const ConversationsPage = () => {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedConversationId = searchParams.get('conversationId');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [draft, setDraft] = useState('');
  const [metaOpen, setMetaOpen] = useState(false);
  const [expandedMessages, setExpandedMessages] = useState<Record<string, boolean>>({});
  const [showNewMessagesCta, setShowNewMessagesCta] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const isAtBottomRef = useRef(true);
  const previousConversationIdRef = useRef<string | null>(null);
  const previousMessageCountRef = useRef(0);

  const conversationsQuery = useQuery({
    queryKey: queryKeys.conversationsList({ search: deferredSearch || undefined }),
    queryFn: () => conversationsClient.list({ search: deferredSearch || undefined }),
    placeholderData: keepPreviousData,
  });

  const selectedConversation = useMemo(
    () =>
      conversationsQuery.data?.find((conversation) => conversation.id === selectedConversationId) ?? null,
    [conversationsQuery.data, selectedConversationId],
  );

  useEffect(() => {
    if (!conversationsQuery.data?.length) {
      return;
    }

    if (selectedConversationId) {
      return;
    }

    startTransition(() => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set('conversationId', conversationsQuery.data?.[0]?.id ?? '');
        return next;
      });
    });
  }, [conversationsQuery.data, selectedConversationId, setSearchParams]);

  const messagesQuery = useQuery({
    queryKey: queryKeys.conversationMessages(selectedConversationId ?? '', MESSAGE_QUERY),
    queryFn: () => conversationsClient.getMessages(selectedConversationId ?? '', MESSAGE_QUERY),
    enabled: Boolean(selectedConversationId),
    placeholderData: keepPreviousData,
  });

  const messages = messagesQuery.data ?? [];

  const markReadMutation = useMutation({
    mutationFn: (conversationId: string) => conversationsClient.markRead(conversationId),
    onSuccess: (_value, conversationId) => {
      queryClient.setQueriesData<ConversationSummary[]>(
        { queryKey: queryKeys.conversationsRoot },
        (current) =>
          current?.map((conversation) =>
            conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation,
          ) ?? current,
      );
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: (payload: { conversationId: string; body: string }) =>
      conversationsClient.sendMessage(payload.conversationId, payload.body),
    onSuccess: (message) => {
      queryClient.setQueryData<ConversationMessage[]>(
        queryKeys.conversationMessages(message.conversationId, MESSAGE_QUERY),
        (current) => [...(current ?? []), message],
      );
      queryClient.setQueriesData<ConversationSummary[]>(
        { queryKey: queryKeys.conversationsRoot },
        (current) => (current ? reorderConversations(current, message) : current),
      );
      setDraft('');
      requestAnimationFrame(() => {
        rowVirtualizer.scrollToIndex(messages.length, { align: 'end' });
      });
    },
  });

  useEffect(() => {
    if (!selectedConversation || selectedConversation.unreadCount === 0 || markReadMutation.isPending) {
      return;
    }

    void markReadMutation.mutateAsync(selectedConversation.id);
  }, [markReadMutation, selectedConversation]);

  const rowVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => messagesScrollRef.current,
    estimateSize: (index) => {
      const message = messages[index];

      if (!message) {
        return 88;
      }

      if (message.kind !== 'text') {
        return 180;
      }

      return Math.min(220, Math.max(84, 60 + Math.ceil(message.body.length / 36) * 22));
    },
    overscan: 8,
  });

  useLayoutEffect(() => {
    const conversationChanged = previousConversationIdRef.current !== selectedConversationId;
    const nextMessageCount = messages.length;
    const hasNewMessage = nextMessageCount > previousMessageCountRef.current;

    if (!selectedConversationId || nextMessageCount === 0) {
      previousConversationIdRef.current = selectedConversationId ?? null;
      previousMessageCountRef.current = nextMessageCount;
      return;
    }

    if (conversationChanged) {
      requestAnimationFrame(() => {
        rowVirtualizer.scrollToIndex(nextMessageCount - 1, { align: 'end' });
      });
      setShowNewMessagesCta(false);
    } else if (hasNewMessage) {
      if (isAtBottomRef.current) {
        requestAnimationFrame(() => {
          rowVirtualizer.scrollToIndex(nextMessageCount - 1, { align: 'end' });
        });
      } else {
        setShowNewMessagesCta(true);
      }
    }

    previousConversationIdRef.current = selectedConversationId;
    previousMessageCountRef.current = nextMessageCount;
  }, [messages.length, rowVirtualizer, selectedConversationId]);

  const handleScroll = () => {
    isAtBottomRef.current = detectBottom(messagesScrollRef.current);

    if (isAtBottomRef.current) {
      setShowNewMessagesCta(false);
    }
  };

  const handleConversationSelect = (conversationId: string) => {
    startTransition(() => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set('conversationId', conversationId);
        return next;
      });
    });
  };

  const handleSendMessage = async () => {
    const nextBody = draft.trim();
    if (!selectedConversationId || !nextBody || sendMessageMutation.isPending) {
      return;
    }

    await sendMessageMutation.mutateAsync({
      conversationId: selectedConversationId,
      body: nextBody,
    });
  };

  const toggleExpanded = (messageId: string) => {
    setExpandedMessages((current) => ({
      ...current,
      [messageId]: !current[messageId],
    }));
  };

  const copyMessageBody = async (message: ConversationMessage) => {
    await navigator.clipboard.writeText(message.body);
    setCopiedMessageId(message.id);
    window.setTimeout(() => {
      setCopiedMessageId((current) => (current === message.id ? null : current));
    }, 1500);
  };

  const jumpToLatest = () => {
    rowVirtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
    setShowNewMessagesCta(false);
  };

  if (conversationsQuery.isPending && !conversationsQuery.data) {
    return (
      <PageShell title="Hội thoại" description="Workspace tập trung cho xử lý tin nhắn đang mở.">
        <QueryStateView kind="loading" title="Đang tải danh sách hội thoại..." />
      </PageShell>
    );
  }

  if (conversationsQuery.isError && !conversationsQuery.data) {
    return (
      <PageShell title="Hội thoại" description="Workspace tập trung cho xử lý tin nhắn đang mở.">
        <QueryStateView
          kind="error"
          description="Không thể tải danh sách hội thoại."
          onRetry={() => {
            void conversationsQuery.refetch();
          }}
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Hội thoại"
      description="Một mục tiêu chính: đọc, trả lời, và giữ scroll ổn định khi hội thoại cập nhật."
    >
      <section className="ds-chat-layout" aria-label="Chat workspace">
        <aside className="ds-chat-sidebar">
          <div className="ds-chat-sidebar-header">
            <Input
              allowClear
              value={search}
              placeholder="Tìm hội thoại..."
              aria-label="Tìm hội thoại"
              onChange={(event) => setSearch(event.target.value)}
            />
            <span className="ds-chat-sidebar-meta">
              {(conversationsQuery.data ?? []).length} hội thoại
            </span>
          </div>

          <div className="ds-chat-sidebar-list" role="list" aria-label="Danh sách hội thoại">
            {(conversationsQuery.data ?? []).map((conversation) => {
              const active = conversation.id === selectedConversationId;

              return (
                <button
                  key={conversation.id}
                  type="button"
                  className={`ds-chat-conversation-item ${active ? 'is-active' : ''}`}
                  onClick={() => handleConversationSelect(conversation.id)}
                >
                  <span className="ds-chat-conversation-avatar" aria-hidden>
                    {conversation.participantAvatar}
                  </span>
                  <span className="ds-chat-conversation-copy">
                    <span className="ds-chat-conversation-topline">
                      <strong>{conversation.participantName}</strong>
                      <AppTooltip title={formatDateTime(conversation.lastMessageAt)}>
                        <time dateTime={conversation.lastMessageAt}>
                          {formatRelativeTime(conversation.lastMessageAt)}
                        </time>
                      </AppTooltip>
                    </span>
                    <span className="ds-chat-conversation-preview">{conversation.preview}</span>
                  </span>
                  {conversation.unreadCount > 0 ? (
                    <span className="ds-chat-conversation-unread" aria-label="Tin chưa đọc">
                      {conversation.unreadCount}
                    </span>
                  ) : null}
                </button>
              );
            })}

            {conversationsQuery.data?.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="Không tìm thấy hội thoại phù hợp"
              />
            ) : null}
          </div>
        </aside>

        <section className="ds-chat-workspace">
          {selectedConversation ? (
            <>
              <header className="ds-chat-header">
                <div className="ds-chat-header-copy">
                  <strong>{selectedConversation.participantName}</strong>
                  <span>{selectedConversation.preview}</span>
                </div>
                <div className="ds-chat-header-actions">
                  <IconActionButton
                    icon={<CheckOutlined />}
                    tooltip="Đánh dấu đã đọc"
                    onClick={() => {
                      void markReadMutation.mutateAsync(selectedConversation.id);
                    }}
                  />
                  <IconActionButton
                    icon={metaOpen ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                    tooltip={metaOpen ? 'Ẩn metadata' : 'Mở metadata'}
                    onClick={() => setMetaOpen((current) => !current)}
                  />
                </div>
              </header>

              {messagesQuery.isError && !messages.length ? (
                <div className="ds-chat-empty-panel">
                  <QueryStateView
                    kind="error"
                    compact
                    description="Không thể tải tin nhắn của hội thoại này."
                    onRetry={() => {
                      void messagesQuery.refetch();
                    }}
                  />
                </div>
              ) : (
                <div ref={messagesScrollRef} className="ds-chat-messages" onScroll={handleScroll}>
                  <div
                    style={{
                      height: `${rowVirtualizer.getTotalSize()}px`,
                      position: 'relative',
                      width: '100%',
                    }}
                  >
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                      const message = messages[virtualRow.index];
                      if (!message) {
                        return null;
                      }

                      const expanded = expandedMessages[message.id] ?? false;
                      const clamp = shouldClampMessage(message) && !expanded;

                      return (
                        <article
                          key={message.id}
                          ref={rowVirtualizer.measureElement}
                          data-index={virtualRow.index}
                          className={`ds-chat-message ${message.authorType === 'agent' ? 'is-agent' : ''}`}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                        >
                          <div className="ds-chat-message-shell">
                            <div className="ds-chat-message-meta">
                              <strong>{message.authorName}</strong>
                              <AppTooltip title={formatDateTime(message.sentAt)}>
                                <time dateTime={message.sentAt}>{formatRelativeTime(message.sentAt)}</time>
                              </AppTooltip>
                            </div>

                            {message.kind === 'text' ? (
                              <div className={`ds-chat-message-body ${clamp ? 'is-clamped' : ''}`}>
                                {message.body}
                              </div>
                            ) : (
                              <div className="ds-chat-code-block">
                                <div className="ds-chat-code-actions">
                                  <span>{message.kind.toUpperCase()}</span>
                                  <IconActionButton
                                    icon={copiedMessageId === message.id ? <CheckOutlined /> : <CopyOutlined />}
                                    tooltip={copiedMessageId === message.id ? 'Đã copy' : 'Copy'}
                                    onClick={() => {
                                      void copyMessageBody(message);
                                    }}
                                  />
                                </div>
                                <pre className={`ds-chat-code-content ${clamp ? 'is-collapsed' : ''}`}>
                                  <code>{message.body}</code>
                                </pre>
                              </div>
                            )}

                            {shouldClampMessage(message) ? (
                              <button
                                type="button"
                                className="ds-chat-expand-button"
                                onClick={() => toggleExpanded(message.id)}
                              >
                                {expanded ? 'Thu gọn' : 'Xem thêm'}
                              </button>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  {showNewMessagesCta ? (
                    <button type="button" className="ds-chat-new-messages" onClick={jumpToLatest}>
                      Tin nhắn mới
                    </button>
                  ) : null}
                </div>
              )}

              <footer className="ds-chat-composer">
                <Input.TextArea
                  autoSize={{ minRows: 2, maxRows: 6 }}
                  value={draft}
                  placeholder="Nhập phản hồi ngắn gọn..."
                  aria-label="Nhập phản hồi"
                  onChange={(event) => setDraft(event.target.value)}
                  onPressEnter={(event) => {
                    if (!event.shiftKey) {
                      event.preventDefault();
                      void handleSendMessage();
                    }
                  }}
                />
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  loading={sendMessageMutation.isPending}
                  onClick={() => {
                    void handleSendMessage();
                  }}
                >
                  Gửi
                </Button>
              </footer>
            </>
          ) : (
            <div className="ds-chat-empty-panel">
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chọn hội thoại để bắt đầu" />
            </div>
          )}
        </section>

        <aside className={`ds-chat-meta-rail ${metaOpen ? 'is-open' : ''}`}>
          {selectedConversation ? (
            <>
              <div className="ds-chat-meta-section">
                <span className="ds-chat-meta-label">Conversation ID</span>
                <code>{selectedConversation.id}</code>
              </div>
              <div className="ds-chat-meta-section">
                <span className="ds-chat-meta-label">Trạng thái</span>
                <span>{selectedConversation.status}</span>
              </div>
              <div className="ds-chat-meta-section">
                <span className="ds-chat-meta-label">Presence</span>
                <span>{selectedConversation.presence}</span>
              </div>
              <div className="ds-chat-meta-section">
                <span className="ds-chat-meta-label">Lần cuối cập nhật</span>
                <span>{formatDateTime(selectedConversation.lastMessageAt)}</span>
              </div>
            </>
          ) : (
            <div className="ds-chat-empty-rail">
              <EllipsisOutlined />
            </div>
          )}
        </aside>
      </section>
    </PageShell>
  );
};
