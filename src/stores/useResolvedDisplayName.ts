import { useEnrichedProfileStore } from "./enrichedProfileStore";
import { useFriendshipStore } from "./friendshipStore";

/**
 * Quy tắc "tên gợi nhớ" (alias) dùng chung: `alias ?? enriched ?? fallback`.
 *
 * `friendshipStore.friendByUserId` là nguồn CHUẨN cho alias — phủ mọi bạn bè và
 * không bị race. `enrichedProfileStore.nameByUserId` chỉ là bản mirror best-effort:
 * `enrichUserProfile` ghi TÊN THẬT vào cùng map đó, nên request nào về sau thì
 * thắng. Đọc alias trực tiếp từ friendshipStore là lý do ChatHeader/RoomItem
 * đáng tin; hook này để mọi chỗ hiển thị tên đều theo một quy tắc.
 *
 * Sống ở file riêng (không nằm trong 2 store) vì friendshipStore đã import
 * enrichedProfileStore — đặt hook vào đó sẽ tạo circular import.
 */
export function useResolvedDisplayName(
  userId: string | undefined,
  fallback: string,
): string {
  const alias = useFriendshipStore((s) =>
    userId ? (s.friendByUserId[userId]?.alias ?? null) : null,
  );
  const enriched = useEnrichedProfileStore((s) =>
    userId ? s.nameByUserId[userId] : undefined,
  );
  return alias || enriched || fallback;
}

/**
 * Avatar tương ứng: `fallback ?? bạn bè ?? enriched`.
 *
 * Khác với tên, `fallback` (avatar do chính API của màn hình trả về) được ưu
 * tiên vì nó gắn với đúng dữ liệu đang hiển thị. Chỉ khi nó rỗng — như list
 * "Người gửi" trong Kho lưu trữ, nơi tab Link không kèm avatar và một số item
 * trả `null` — mới lấy từ `friendshipStore` (đã có sẵn, không tốn request) rồi
 * tới bản `enrichUserProfile` cache về.
 *
 * Trả URL thô: caller tự chạy `resolvePublicResourceUrl` như mọi call site
 * avatar khác.
 */
export function useResolvedAvatarUrl(
  userId: string | undefined,
  fallback?: string | null,
): string | null {
  const friendAvatar = useFriendshipStore((s) =>
    userId ? (s.friendByUserId[userId]?.avatar ?? null) : null,
  );
  const enriched = useEnrichedProfileStore((s) =>
    userId ? s.avatarByUserId[userId] : undefined,
  );
  return fallback?.trim() || friendAvatar || enriched || null;
}
