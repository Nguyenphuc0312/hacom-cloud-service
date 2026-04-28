import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Select, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { getErrorMessage } from '@/api/error/error';
import { conversationsClient } from '@/api/clients/conversationsClient/conversationsClient';
import { queryKeys } from '@/api/queryKeys/queryKeys';
import type { ConversationMessage, ConversationStatus, ConversationSummary } from '@/api/types/conversations/conversations';
import { AppIcon } from '@/components/AppIcon/AppIcon';
import { AvatarCell } from '@/components/AvatarCell/AvatarCell';
import { DataTableShell } from '@/components/DataTableShell/DataTableShell';
import { DateTimeCell } from '@/components/DateTimeCell/DateTimeCell';
import { DetailPanel } from '@/components/DetailPanel/DetailPanel';
import { FilterBar } from '@/components/FilterBar/FilterBar';
import { MetaCell } from '@/components/MetaCell/MetaCell';
import { PageShell } from '@/components/PageShell/PageShell';
import { QueryStateView } from '@/components/QueryStates/QueryStates';
import { RowActionsDropdown } from '@/components/RowActionsDropdown/RowActionsDropdown';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { DataTable } from '@/components/ui/DataTable/DataTable';
import { EmptyState } from '@/components/ui/EmptyState/EmptyState';
import './ConversationsPage.css';

const MESSAGE_QUERY = { limit: 200 } as const;

type ConversationStatusFilter = 'all' | ConversationStatus;

const STATUS_OPTIONS = [
  { label: 'Tất cả trạng thái', value: 'all' },
  { label: 'Đang mở', value: 'open' },
  { label: 'Chờ xử lý', value: 'pending' },
  { label: 'Đã xử lý', value: 'resolved' },
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
      message.error(getErrorMessage(error, 'Không thể đánh dấu hội thoại đã đọc.'));
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
        title: 'Hội thoại',
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
        title: 'Loại',
        key: 'type',
        width: 120,
        render: () => <MetaCell primary="-" secondary="API chưa trả về" />,
      },
      {
        title: 'Thành viên',
        key: 'members',
        width: 220,
        render: (_, record) => <MetaCell primary={record.participantName} />,
      },
      {
        title: 'Tin nhắn cuối',
        dataIndex: 'lastMessageAt',
        width: 170,
        render: (value: string) => <DateTimeCell value={value} />,
      },
      {
        title: 'Trạng thái',
        dataIndex: 'status',
        width: 130,
        render: (value: ConversationStatus) => <StatusBadge status={value} />,
      },
      {
        title: 'Tạo lúc',
        key: 'createdAt',
        width: 150,
        render: () => <MetaCell primary="-" secondary="API chưa trả về" />,
      },
      {
        title: 'Thao tác',
        key: 'actions',
        width: 84,
        fixed: 'right',
        render: (_, record) => (
          <RowActionsDropdown
            actions={[
              {
                key: 'detail',
                label: 'Mở tin nhắn',
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
        title: 'Thời gian',
        dataIndex: 'sentAt',
        width: 160,
        render: (value: string) => <DateTimeCell value={value} />,
      },
      {
        title: 'Người gửi',
        dataIndex: 'authorName',
        width: 180,
        render: (value: string, record) => (
          <MetaCell primary={value} secondary={record.authorType} />
        ),
      },
      {
        title: 'Hội thoại',
        dataIndex: 'conversationId',
        width: 180,
        ellipsis: true,
      },
      {
        title: 'Xem trước',
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
        title: 'Trạng thái',
        key: 'status',
        width: 120,
        render: () => <StatusBadge status="available" />,
      },
      {
        title: 'Thứ tự tin',
        key: 'messageSeq',
        width: 140,
        render: (_, record) => <MetaCell primary={record.id} />,
      },
    ],
    [],
  );

  const pageHeader = {
    eyebrow: 'Hệ thống chat',
    title: 'Hội thoại',
    description: 'Kiểm tra hội thoại và tin nhắn theo dạng bảng quản trị.',
  };

  if (conversationsQuery.isPending && !conversationsQuery.data) {
    return (
      <PageShell {...pageHeader}>
        <QueryStateView kind="loading" title="Đang tải hội thoại..." />
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
            'API quản trị hội thoại chưa khả dụng.',
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
          Làm mới
        </Button>
      }
    >
      <FilterBar className="conversations-page-filter">
        <div className="ds-toolbar-form">
          <div className="ds-toolbar-field ds-toolbar-field--lg">
            <Input
              allowClear
              value={search}
              placeholder="Tìm thành viên hoặc nội dung xem trước"
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
          <span>{filteredConversations.length} hội thoại</span>
          <span>Chi tiết hội thoại mở trong panel bên</span>
        </div>
      </FilterBar>

      <div className="ds-page-with-detail">
        <DataTableShell
          title="Hội thoại"
          meta="Đây là bảng vận hành để quét bản ghi, không phải UI chat người dùng."
        >
          <DataTable
            rowKey="id"
            columns={columns}
            minHeight={420}
            loading={conversationsQuery.isFetching && !conversationsQuery.isPending}
            dataSource={filteredConversations}
            emptyNode={
              <EmptyState description="Không có hội thoại khớp bộ lọc hiện tại." />
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
          title={selectedConversation?.participantName ?? 'Tin nhắn'}
          onClose={() => {
            setSearchParams((current) => {
              const next = new URLSearchParams(current);
              next.delete('conversationId');
              return next;
            });
          }}
          width={840}
          className="ds-ops-detail-panel"
        >
          {!selectedConversationId ? (
            <EmptyState description="Chọn một hội thoại để xem tin nhắn." compact />
          ) : messagesQuery.isPending && !messagesQuery.data ? (
            <QueryStateView kind="loading" compact title="Đang tải tin nhắn..." />
          ) : messagesQuery.isError ? (
            <QueryStateView
              kind="error"
              compact
              description={getErrorMessage(messagesQuery.error, 'Không thể tải tin nhắn.')}
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
                      Đánh dấu đã đọc
                    </Button>
                    <Button
                      size="small"
                      onClick={() => {
                        void navigator.clipboard.writeText(selectedConversation.id);
                        message.success('Đã sao chép ID hội thoại.');
                      }}
                    >
                      Sao chép ID
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
                emptyNode={<EmptyState description="Không có tin nhắn được trả về." compact />}
              />
            </div>
          )}
        </DetailPanel>
      </div>
    </PageShell>
  );
};
