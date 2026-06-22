# MessageItem

Render một dòng timeline trong chat. Tách theo single-responsibility để dễ memo hóa và test. Đây là tài liệu duy nhất cho module (đã gộp từ `ARCHITECTURE.md` + `DATA_FLOW.md` cũ).

## Cấu trúc file

| File | Trách nhiệm |
|---|---|
| `MessageItem.tsx` | Orchestrator: resolve message từ `item`/props, `React.memo` + custom comparator `areEqualMessageItem`, ghi `recordChatRenderCount` |
| `MessageItemWrapper.tsx` | Container styling: spacing (`getTimelineItemSpacingClass`), highlight khi chọn, click handler cho selection mode |
| `MessageItemSelection.tsx` | Checkbox chọn tin (chỉ render khi `isSelectionMode`), chặn bubbling, i18n aria-label |
| `MessageItemContent.tsx` | Content router theo `item.kind` (xem bên dưới) |
| `types.ts` | `MessageItemProps`, `MessageItemContentProps`, `MessageItemSelectionProps`, `MessageItemWrapperProps` |
| `utils.ts` | Pure functions: `resolveLiveMessage`, `getLayoutSensitiveSignature`, `getAttachmentLayoutSignature`, `getReplyLayoutSignature`, `getForwardedSignature` |
| `index.ts` | Barrel export công khai |

## Routing theo `item.kind` (trong `MessageItemContent`)

| kind | Render |
|---|---|
| `date` | `DateDivider` |
| `unread` | `UnreadDivider` |
| `system` | `SystemMessage` |
| `message` | `MessageCluster` (→ `MessageRow`/`MessageBodyRenderer`, `ReactionBar`, actions, reply preview, thread indicator) |

Parent chỉ cần truyền `item` — không cần tự switch theo kind.

## Dùng

```tsx
import { MessageItem } from "@/components/chat/MessageItem";

<MessageItem
  item={timelineItem}
  message={message}
  onReply={handleReply}
  onReact={handleReact}
  onEdit={handleEdit}
  onDelete={handleDelete}
  onForward={handleForward}
  density="comfortable"
  isSelectionMode={false}
/>;
```

Data chảy xuống (parent → child) qua props; callback chảy lên (child → parent). State (selectedIds, isSelectionMode…) sống ở parent; con chỉ nhận props.

## Memoization (quan trọng)

`React.memo(MessageItem, areEqualMessageItem)`:
- Fast path: `item` reference không đổi → so sánh shallow các prop còn lại.
- Theo kind: `date` so `getTime()`; `unread` luôn bằng; `system`/`message` so `getLayoutSensitiveSignature()`.
- Signature gộp: core (type/sender/content/status/sendState), flags (edited/deleted/pinned), relations (reply/forward signature), attachments, social (reactions/readBy/mentions), thread count.

Khi đổi logic render bubble, **giữ signature phản ánh đúng phần ảnh hưởng layout** — nếu không sẽ stale do memo. Đo lại bằng `recordChatRenderCount` (xem React DevTools Profiler).

## Thêm tính năng

Giữ một-trách-nhiệm-một-file: prop mới → cập nhật `types.ts`; util thuần mới → `utils.ts`; UI con mới → file riêng (vd `MessageItemDragHandle.tsx`) rồi compose trong `MessageItem.tsx` và export ở `index.ts`.
