import { CheckOutlined, CopyOutlined } from '@ant-design/icons';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Empty, Input, Select, message } from 'antd';
import { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { conversationsClient } from '@/api/clients';
import { queryKeys } from '@/api/queryKeys';
import type { ConversationMessage, ConversationSummary } from '@/api/types';
import { AppTooltip } from '@/components/AppTooltip';
import { IconActionButton } from '@/components/IconActionButton';
import { PageShell } from '@/components/PageShell';
import { QueryStateView } from '@/components/QueryStates';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDateTime, formatRelativeTime } from '@/utils/date';

const MESSAGE_QUERY = { limit: 200 } as const;

type ConversationStatusFilter = 'all' | 'open' | 'pending' | 'resolved';

interface ConversationInspectorContext {
  accountLabel: string;
  service: string;
  queue: string;
  moderationState: string;
  risk: 'healthy' | 'warning' | 'error';
  notes: string;
}

const STATUS_OPTIONS = [
  { label: 'Mọi trạng thái', value: 'all' },
  { label: 'Open', value: 'open' },
  { label: 'Pending', value: 'pending' },
  { label: 'Resolved', value: 'resolved' },
] as const;

const INSPECTOR_CONTEXT: Record<string, ConversationInspectorContext> = {
  'c-1001': {
    accountLabel: 'Nguyễn Thu Hà · ACC-2041',
    service: 'after-sales',
    queue: 'manual warranty review',
    moderationState: 'clean',
    risk: 'warning',
    notes: 'Conversation gắn với ticket bảo hành pending lâu hơn baseline. Ưu tiên đối chiếu audit và worker logs.',
  },
  'c-1002': {
    accountLabel: 'Lê Minh Khoa · ACC-1842',
    service: 'developer support',
    queue: 'manual payload review',
    moderationState: 'manual_review',
    risk: 'error',
    notes: 'Có payload kỹ thuật và attachment lỗi schema. Cần đối chiếu log enrichment trước khi đóng.',
  },
  'c-1003': {
    accountLabel: 'Trần Gia Hân · ACC-7710',
    service: 'access support',
    queue: 'resolved queue',
    moderationState: 'clean',
    risk: 'healthy',
    notes: 'Hội thoại đã xử lý xong; dùng làm tham chiếu nếu cần xác nhận luồng hỗ trợ đã đóng.',
  },
};

const shouldClampMessage = (message: ConversationMessage) =>
  message.kind !== 'text' || message.body.length > 320 || message.body.split('\n').length > 6;

const buildConversationLabel = (conversation: ConversationSummary) => {
  const context = INSPECTOR_CONTEXT[conversation.id];
  return context ? `${conversation.participantName} · ${context.service}` : conversation.participantName;
};

export const ConversationsPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedConversationId = searchParams.get('conversationId');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ConversationStatusFilter>('all');
  const [expandedMessages, setExpandedMessages] = useState<Record<string, boolean>>({});
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search.trim());

  const conversationsQuery = useQuery({
    queryKey: queryKeys.conversationsList({ search: deferredSearch || undefined }),
    queryFn: () => conversationsClient.list({ search: deferredSearch || undefined }),
    placeholderData: keepPreviousData,
  });

  const filteredConversations = useMemo(
    () =>
      (conversationsQuery.data ?? []).filter((conversation) =>
        statusFilter === 'all' ? true : conversation.status === statusFilter,
      ),
    [conversationsQuery.data, statusFilter],
  );

  const selectedConversation = useMemo(
    () => (conversationsQuery.data ?? []).find((conversation) => conversation.id === selectedConversationId) ?? null,
    [conversationsQuery.data, selectedConversationId],
  );

  useEffect(() => {
    if (!filteredConversations.length) {
      return;
    }

    if (selectedConversationId && filteredConversations.some((conversation) => conversation.id === selectedConversationId)) {
      return;
    }

    startTransition(() => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set('conversationId', filteredConversations[0]?.id ?? '');
        return next;
      });
    });
  }, [filteredConversations, selectedConversationId, setSearchParams]);

  const messagesQuery = useQuery({
    queryKey: queryKeys.conversationMessages(selectedConversationId ?? '', MESSAGE_QUERY),
    queryFn: () => conversationsClient.getMessages(selectedConversationId ?? '', MESSAGE_QUERY),
    enabled: Boolean(selectedConversationId),
    placeholderData: keepPreviousData,
  });

  const messages = messagesQuery.data ?? [];
  const selectedContext = selectedConversation ? INSPECTOR_CONTEXT[selectedConversation.id] : null;

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

  useEffect(() => {
    if (!selectedConversation || selectedConversation.unreadCount === 0 || markReadMutation.isPending) {
      return;
    }

    void markReadMutation.mutateAsync(selectedConversation.id);
  }, [markReadMutation, selectedConversation]);

  const handleConversationSelect = (conversationId: string) => {
    startTransition(() => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set('conversationId', conversationId);
        return next;
      });
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

  if (conversationsQuery.isPending && !conversationsQuery.data) {
    return (
      <PageShell
        eyebrow="Vận hành"
        title="Tra cứu hội thoại"
        description="Module này phục vụ điều tra và moderation; chat chỉ là transcript để tham chiếu."
      >
        <QueryStateView kind="loading" title="Đang tải danh sách hội thoại..." />
      </PageShell>
    );
  }

  if (conversationsQuery.isError && !conversationsQuery.data) {
    return (
      <PageShell
        eyebrow="Vận hành"
        title="Tra cứu hội thoại"
        description="Module này phục vụ điều tra và moderation; chat chỉ là transcript để tham chiếu."
      >
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
      eyebrow="Vận hành"
      title="Tra cứu hội thoại"
      description="Inspection-first workspace cho transcript, account context và thao tác moderation nội bộ."
    >
      <section className="ds-conversation-layout" aria-label="Conversation inspection workspace">
        <aside className="ds-conversation-sidebar">
          <div className="ds-conversation-sidebar-header">
            <Input
              allowClear
              value={search}
              placeholder="Tìm theo user, preview hoặc queue"
              onChange={(event) => setSearch(event.target.value)}
            />
            <Select
              value={statusFilter}
              options={STATUS_OPTIONS as unknown as { label: string; value: string }[]}
              onChange={(value) => setStatusFilter(value as ConversationStatusFilter)}
            />
            <span className="ds-conversation-sidebar-meta">
              {filteredConversations.length} hội thoại hiển thị
            </span>
          </div>

          <div className="ds-conversation-sidebar-list" role="list" aria-label="Danh sách hội thoại">
            {filteredConversations.map((conversation) => {
              const active = conversation.id === selectedConversationId;

              return (
                <button
                  key={conversation.id}
                  type="button"
                  className={`ds-conversation-list-item ${active ? 'is-active' : ''}`}
                  onClick={() => handleConversationSelect(conversation.id)}
                >
                  <div className="ds-conversation-list-main">
                    <div className="ds-conversation-list-topline">
                      <strong>{buildConversationLabel(conversation)}</strong>
                      <AppTooltip title={formatDateTime(conversation.lastMessageAt)}>
                        <time dateTime={conversation.lastMessageAt}>
                          {formatRelativeTime(conversation.lastMessageAt)}
                        </time>
                      </AppTooltip>
                    </div>
                    <span className="ds-conversation-list-preview">{conversation.preview}</span>
                  </div>

                  <div className="ds-conversation-list-side">
                    <StatusBadge status={conversation.status} />
                    {conversation.unreadCount > 0 ? (
                      <span className="ds-conversation-unread-count">{conversation.unreadCount}</span>
                    ) : null}
                  </div>
                </button>
              );
            })}

            {filteredConversations.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không tìm thấy hội thoại phù hợp." />
            ) : null}
          </div>
        </aside>

        <section className="ds-conversation-transcript">
          {selectedConversation ? (
            <>
              <header className="ds-conversation-header">
                <div className="ds-conversation-header-copy">
                  <span className="ds-conversation-header-eyebrow">Conversation inspection</span>
                  <strong>{selectedConversation.participantName}</strong>
                  <p>{selectedContext?.notes ?? selectedConversation.preview}</p>
                </div>

                <div className="ds-conversation-header-actions">
                  <StatusBadge status={selectedConversation.status} />
                  <StatusBadge status={selectedConversation.presence} />
                  <IconActionButton
                    icon={<CheckOutlined />}
                    tooltip="Đánh dấu đã đọc"
                    onClick={() => {
                      void markReadMutation.mutateAsync(selectedConversation.id);
                    }}
                  />
                  <Button onClick={() => navigate('/users')}>Mở tài khoản</Button>
                  <Button onClick={() => navigate('/audit')}>Mở audit</Button>
                </div>
              </header>

              {messagesQuery.isError && !messages.length ? (
                <div className="ds-conversation-empty">
                  <QueryStateView
                    kind="error"
                    compact
                    description="Không thể tải transcript của hội thoại này."
                    onRetry={() => {
                      void messagesQuery.refetch();
                    }}
                  />
                </div>
              ) : (
                <div className="ds-conversation-stream">
                  {messages.map((message) => {
                    const expanded = expandedMessages[message.id] ?? false;
                    const clamp = shouldClampMessage(message) && !expanded;

                    return (
                      <article
                        key={message.id}
                        className={`ds-conversation-event type-${message.authorType}`}
                      >
                        <div className="ds-conversation-event-meta">
                          <strong>{message.authorName}</strong>
                          <span>{message.kind.toUpperCase()}</span>
                          <AppTooltip title={formatDateTime(message.sentAt)}>
                            <time dateTime={message.sentAt}>{formatRelativeTime(message.sentAt)}</time>
                          </AppTooltip>
                        </div>

                        <div className="ds-conversation-event-body">
                          {message.kind === 'text' ? (
                            <div className={`ds-conversation-event-text ${clamp ? 'is-clamped' : ''}`}>
                              {message.body}
                            </div>
                          ) : (
                            <div className="ds-conversation-event-code">
                              <div className="ds-conversation-event-code-bar">
                                <span>{message.kind.toUpperCase()}</span>
                                <IconActionButton
                                  icon={copiedMessageId === message.id ? <CheckOutlined /> : <CopyOutlined />}
                                  tooltip={copiedMessageId === message.id ? 'Đã copy' : 'Copy'}
                                  onClick={() => {
                                    void copyMessageBody(message);
                                  }}
                                />
                              </div>
                              <pre className={clamp ? 'is-collapsed' : ''}>
                                <code>{message.body}</code>
                              </pre>
                            </div>
                          )}

                          {shouldClampMessage(message) ? (
                            <button
                              type="button"
                              className="ds-conversation-expand"
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
              )}
            </>
          ) : (
            <div className="ds-conversation-empty">
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chọn một hội thoại để bắt đầu tra cứu." />
            </div>
          )}
        </section>

        <aside className="ds-conversation-inspector">
          {selectedConversation ? (
            <>
              <section className="ds-conversation-inspector-section">
                <span className="ds-conversation-inspector-label">Account</span>
                <strong>{selectedContext?.accountLabel ?? 'Chưa liên kết'}</strong>
                <p>{selectedConversation.id}</p>
              </section>

              <section className="ds-conversation-inspector-section">
                <span className="ds-conversation-inspector-label">Operational context</span>
                <dl className="ds-ops-fact-list">
                  <div>
                    <dt>Queue</dt>
                    <dd>{selectedContext?.queue ?? '-'}</dd>
                  </div>
                  <div>
                    <dt>Service</dt>
                    <dd>{selectedContext?.service ?? '-'}</dd>
                  </div>
                  <div>
                    <dt>Moderation</dt>
                    <dd>{selectedContext?.moderationState ?? '-'}</dd>
                  </div>
                  <div>
                    <dt>Last update</dt>
                    <dd>{formatDateTime(selectedConversation.lastMessageAt)}</dd>
                  </div>
                </dl>
              </section>

              <section className="ds-conversation-inspector-section">
                <span className="ds-conversation-inspector-label">Risk</span>
                <StatusBadge status={selectedContext?.risk ?? 'unknown'} />
                <p>{selectedContext?.notes ?? 'Không có ghi chú vận hành.'}</p>
              </section>

              <section className="ds-conversation-inspector-section">
                <span className="ds-conversation-inspector-label">Actions</span>
                <div className="ds-ops-inline-list">
                  <Button size="small" onClick={() => navigate('/logs')}>
                    Mở system logs
                  </Button>
                  <Button size="small" onClick={() => navigate('/audit')}>
                    Mở audit trail
                  </Button>
                  <Button
                    size="small"
                    onClick={() => {
                      void navigator.clipboard.writeText(selectedConversation.id);
                      message.success('Đã copy conversation ID.');
                    }}
                  >
                    Copy ID
                  </Button>
                </div>
              </section>
            </>
          ) : (
            <div className="ds-conversation-empty">
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Inspector hiển thị theo hội thoại đã chọn." />
            </div>
          )}
        </aside>
      </section>
    </PageShell>
  );
};
