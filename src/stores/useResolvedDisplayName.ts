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
