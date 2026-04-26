import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Select, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { getErrorMessage } from '@/api/error';
import { conversationsClient } from '@/api/clients';
import { queryKeys } from '@/api/queryKeys';
import type { ConversationMessage, ConversationStatus, ConversationSummary } from '@/api/types';
import { AppIcon } from '@/components/AppIcon';
import { AvatarCell } from '@/components/AvatarCell';
import { DataTableShell } from '@/components/DataTableShell';
import { DateTimeCell } from '@/components/DateTimeCell';
import { DetailPanel } from '@/components/DetailPanel';
import { FilterBar } from '@/components/FilterBar';
import { MetaCell } from '@/components/MetaCell';
import { PageShell } from '@/components/PageShell';
import { QueryStateView } from '@/components/QueryStates';
import { RowActionsDropdown } from '@/components/RowActionsDropdown';
import { StatusBadge } from '@/components/StatusBadge';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';

const MESSAGE_QUERY = { limit: 200 } as const;

type ConversationStatusFilter = 'all' | ConversationStatus;

const STATUS_OPTIONS = [
  { label: 'All statuses', value: 'all' },
  { label: 'Open', value: 'open' },
  { label: 'Pending', value: 'pending' },
  { label: 'Resolved', value: 'resolved' },
] as const;

const shouldClampMessage = (message: ConversationMessage) =>
  message.kind !== 'text' || message.body.length > 180 || message.body.split('\n').length > 2;

export const ConversationsPage = () => {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedConversationId = searchParams.get('conversationId');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ConversationStatusFilter>('all');
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
    () =>
      (conversationsQuery.data ?? []).find(
        (conversation) => conversation.id === selectedConversationId,
      ) ?? null,
    [conversationsQuery.data, selectedConversationId],
  );

  const messagesQuery = useQuery({
    queryKey: queryKeys.conversationMessages(selectedConversationId ?? '', MESSAGE_QUERY),
    queryFn: () => conversationsClient.getMessages(selectedConversationId ?? '', MESSAGE_QUERY),
    enabled: Boolean(selectedConversationId),
    placeholderData: keepPreviousData,
  });

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
    onError: (error) => {
      message.error(getErrorMessage(error, 'Unable to mark conversation as read.'));
    },
  });

  useEffect(() => {
    if (!selectedConversationId || filteredConversations.some((item) => item.id === selectedConversationId)) {
      return;
    }

    startTransition(() => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.delete('conversationId');
        return next;
      });
    });
  }, [filteredConversations, selectedConversationId, setSearchParams]);

  const selectConversation = useCallback((conversationId: string) => {
    startTransition(() => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set('conversationId', conversationId);
        return next;
      });
    });
  }, [setSearchParams]);

  const columns = useMemo<ColumnsType<ConversationSummary>>(
    () => [
      {
        title: 'Conversation',
        key: 'conversation',
        width: 280,
        fixed: 'left',
        render: (_, record) => (
          <AvatarCell
            name={record.participantName}
            description={record.preview}
            code={record.participantAvatar}
          />
        ),
      },
      {
        title: 'Type',
        key: 'type',
        width: 120,
        render: () => <MetaCell primary="-" secondary="Not returned" />,
      },
      {
        title: 'Members',
        key: 'members',
        width: 220,
        render: (_, record) => <MetaCell primary={record.participantName} />,
      },
      {
        title: 'Last Message At',
        dataIndex: 'lastMessageAt',
        width: 170,
        render: (value: string) => <DateTimeCell value={value} />,
      },
      {
        title: 'Status',
        dataIndex: 'status',
        width: 130,
        render: (value: ConversationStatus) => <StatusBadge status={value} />,
      },
      {
        title: 'Created At',
        key: 'createdAt',
        width: 150,
        render: () => <MetaCell primary="-" secondary="Not returned" />,
      },
      {
        title: 'Actions',
        key: 'actions',
        width: 84,
        fixed: 'right',
        render: (_, record) => (
          <RowActionsDropdown
            actions={[
              {
                key: 'detail',
                label: 'Open messages',
                icon: <AppIcon name="eye" size={14} aria-hidden />,
                onClick: () => selectConversation(record.id),
              },
            ]}
          />
        ),
      },
    ],
    [selectConversation],
  );

  const messageColumns = useMemo<ColumnsType<ConversationMessage>>(
    () => [
      {
        title: 'Time',
        dataIndex: 'sentAt',
        width: 160,
        render: (value: string) => <DateTimeCell value={value} />,
      },
      {
        title: 'Sender',
        dataIndex: 'authorName',
        width: 180,
        render: (value: string, record) => (
          <MetaCell primary={value} secondary={record.authorType} />
        ),
      },
      {
        title: 'Conversation',
        dataIndex: 'conversationId',
        width: 180,
        ellipsis: true,
      },
      {
        title: 'Preview',
        key: 'preview',
        width: 360,
        ellipsis: true,
        render: (_, record) => (
          <MetaCell
            primary={shouldClampMessage(record) ? `${record.body.slice(0, 160)}...` : record.body}
            secondary={record.kind}
          />
        ),
      },
      {
        title: 'Status',
        key: 'status',
        width: 120,
        render: () => <StatusBadge status="available" />,
      },
      {
        title: 'Message Seq',
        key: 'messageSeq',
        width: 140,
        render: (_, record) => <MetaCell primary={record.id} />,
      },
    ],
    [],
  );

  const pageHeader = {
    eyebrow: 'Chat System',
    title: 'Conversations',
    description: 'Inspect conversation and message records in an admin table layout.',
  };

  if (conversationsQuery.isPending && !conversationsQuery.data) {
    return (
      <PageShell {...pageHeader}>
        <QueryStateView kind="loading" title="Loading conversations..." />
      </PageShell>
    );
  }

  if (conversationsQuery.isError && !conversationsQuery.data) {
    return (
      <PageShell {...pageHeader}>
        <QueryStateView
          kind="error"
          description={getErrorMessage(
            conversationsQuery.error,
            'Conversation admin API is not available yet.',
          )}
          onRetry={() => {
            void conversationsQuery.refetch();
          }}
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      {...pageHeader}
      headerExtra={
        <Button
          icon={<AppIcon name="refresh" size={14} />}
          loading={conversationsQuery.isFetching}
          onClick={() => {
            void conversationsQuery.refetch();
          }}
        >
          Refresh
        </Button>
      }
    >
      <FilterBar>
        <div className="ds-toolbar-form">
          <div className="ds-toolbar-field ds-toolbar-field--lg">
            <Input
              allowClear
              value={search}
              placeholder="Search participant or preview"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="ds-toolbar-field ds-toolbar-field--md">
            <Select
              value={statusFilter}
              options={STATUS_OPTIONS as unknown as { label: string; value: string }[]}
              onChange={(value) => setStatusFilter(value as ConversationStatusFilter)}
            />
          </div>
        </div>
        <div className="ds-filter-toolbar-meta">
          <span>{filteredConversations.length} conversations</span>
          <span>Conversation details open in the side panel</span>
        </div>
      </FilterBar>

      <div className="ds-page-with-detail">
        <DataTableShell
          title="Conversations"
          meta="No consumer-chat UI here; this is an operator table for scanning records."
        >
          <DataTable
            rowKey="id"
            columns={columns}
            minHeight={420}
            loading={conversationsQuery.isFetching && !conversationsQuery.isPending}
            dataSource={filteredConversations}
            emptyNode={
              <EmptyState description="No conversations were returned for the current filters." />
            }
            pagination={{ pageSize: 10, hideOnSinglePage: true }}
            onRow={(record) => ({
              onClick: () => selectConversation(record.id),
              style: { cursor: 'pointer' },
            })}
          />
        </DataTableShell>

        <DetailPanel
          open={Boolean(selectedConversationId)}
          title={selectedConversation?.participantName ?? 'Messages'}
          onClose={() => {
            setSearchParams((current) => {
              const next = new URLSearchParams(current);
              next.delete('conversationId');
              return next;
            });
          }}
          width={520}
          className="ds-ops-detail-panel"
        >
          {!selectedConversationId ? (
            <EmptyState description="Select a conversation to inspect messages." compact />
          ) : messagesQuery.isPending && !messagesQuery.data ? (
            <QueryStateView kind="loading" compact title="Loading messages..." />
          ) : messagesQuery.isError ? (
            <QueryStateView
              kind="error"
              compact
              description={getErrorMessage(messagesQuery.error, 'Unable to load messages.')}
              onRetry={() => {
                void messagesQuery.refetch();
              }}
            />
          ) : (
            <div className="ds-ops-detail-stack">
              {selectedConversation ? (
                <section className="ds-ops-detail-section">
                  <div className="ds-ops-detail-header">
                    <AvatarCell
                      name={selectedConversation.participantName}
                      description={selectedConversation.preview}
                      code={selectedConversation.participantAvatar}
                    />
                    <StatusBadge status={selectedConversation.status} />
                  </div>
                  <div className="ds-admin-inline-actions">
                    <Button
                      size="small"
                      disabled={markReadMutation.isPending}
                      onClick={() => void markReadMutation.mutateAsync(selectedConversation.id)}
                    >
                      Mark Read
                    </Button>
                    <Button
                      size="small"
                      onClick={() => {
                        void navigator.clipboard.writeText(selectedConversation.id);
                        message.success('Conversation ID copied.');
                      }}
                    >
                      Copy ID
                    </Button>
                  </div>
                </section>
              ) : null}

              <DataTable
                rowKey="id"
                columns={messageColumns}
                minHeight={320}
                dataSource={messagesQuery.data ?? []}
                pagination={false}
                emptyNode={<EmptyState description="No messages were returned." compact />}
              />
            </div>
          )}
        </DetailPanel>
      </div>
    </PageShell>
  );
};
