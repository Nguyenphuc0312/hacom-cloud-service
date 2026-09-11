import {
  readFreshAvatarUrl,
  useEnrichedProfileStore,
} from "./enrichedProfileStore";
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
const normalizeAliasLabel = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();

const resolveAlias = (
  byUserId: Record<string, { alias?: string | null; displayName?: string; username?: string }>,
  userId: string | undefined,
  fallback: string,
): string | undefined => {
  const direct = userId ? byUserId[userId]?.alias?.trim() : undefined;
  if (direct) return direct;

  const label = normalizeAliasLabel(fallback);
  if (!label) return undefined;
  const matches = Object.values(byUserId).filter((friend) => {
    if (!friend.alias?.trim()) return false;
    return [friend.displayName, friend.username].some((name) => {
      const candidate = normalizeAliasLabel(name ?? "");
      return candidate === label || candidate.endsWith(" " + label) || label.endsWith(" " + candidate);
    });
  });
  return matches.length === 1 ? matches[0]?.alias?.trim() : undefined;
};

export function resolveStoredDisplayName(
  userId: string | undefined,
  fallback: string,
): string {
  const alias = resolveAlias(
    useFriendshipStore.getState().friendByUserId,
    userId,
    fallback,
  );
  const enriched = userId
    ? useEnrichedProfileStore.getState().nameByUserId[userId]
    : undefined;
  return alias || enriched || fallback;
}

export function useResolvedDisplayName(
  userId: string | undefined,
  fallback: string,
): string {
  const friendByUserId = useFriendshipStore((s) => s.friendByUserId);
  const alias = resolveAlias(friendByUserId, userId, fallback);
  const enriched = useEnrichedProfileStore((s) =>
    userId ? s.nameByUserId[userId] : undefined,
  );
  return alias || enriched || fallback;
}

/**
 * Avatar tương ứng: `enriched ?? bạn bè ?? fallback`.
 *
 * ⚠️ Thứ tự NGƯỢC với tên, và đây là điểm mấu chốt của bug "Người gửi mất
 * avatar" — đừng đảo lại.
 *
 * Avatar của hệ thống là URL PRESIGNED, hạn 15 phút (`X-Amz-Expires=900`).
 * Nhưng `senderAvatarUrl` mà các endpoint resources (media/files) trả về được
 * đọc từ `sender_snapshot.avatar_url` — bản chụp ĐÔNG CỨNG lúc gửi tin, không
 * hề ký lại (`chat-api-service/src/services/conversationResources.service.ts:254`).
 * Tin gửi hôm qua ⇒ chữ ký hết hạn từ 18 tiếng trước ⇒ ảnh 403, ra chữ cái đầu.
 * Đo thực tế trên `Core Hacom`: cả 4 sender đều CÓ url, và cả 4 đều 403.
 *
 * Vì vậy `fallback` (url của chính item) là nguồn KÉM tin cậy nhất, chỉ dùng khi
 * không còn gì khác. Ưu tiên bản `enrichUserProfile` lấy từ `POST /users/batch`
 * — BE ký lại mỗi lần đọc (`user.service.ts#rehydrateCachedAvatar`) nên luôn
 * còn hạn — rồi tới `friendshipStore`.
 *
 * Bản enriched quá hạn bị coi như KHÔNG CÓ (`readFreshAvatarUrl`) để rơi về chữ
 * cái đầu thay vì trả link chết. Đừng đổi thành cache vĩnh viễn.
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
    userId ? readFreshAvatarUrl(s.avatarByUserId[userId]) : undefined,
  );
  return enriched || friendAvatar || fallback?.trim() || null;
}
