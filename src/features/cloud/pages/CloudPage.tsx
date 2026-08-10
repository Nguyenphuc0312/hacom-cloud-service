import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { cloudApi } from '../api/cloudApi';
import {
  cacheCloudConversationId,
  isPersonalCloudConversation,
  readCachedCloudConversationId,
} from '../personalCloudPolicy';
import { useChatStore } from '../../../stores/chatStore';
// Import thẳng file, không qua barrel components/ui — barrel đó nằm trong các vòng
// import sẵn có (xem CLAUDE.md mục 13).
import { PageSpinner } from '../../../components/ui/Spinner';

/**
 * "Cloud của tôi" sống trong danh sách hội thoại như mọi cuộc trò chuyện khác.
 * /cloud chỉ còn là lối tắt (icon rail, bookmark cũ): giải id rồi nhường cho /chat/<id>.
 *
 * Ưu tiên id đã cache để chuyển hướng ngay trong lần render đầu — chờ ensure() xong
 * mới điều hướng khiến người dùng nhìn thấy màn chờ vài giây.
 */
export const CloudPage = () => {
  const [conversationId, setConversationId] = useState<string | null>(() =>
    readCachedCloudConversationId(),
  );
  const [failed, setFailed] = useState(false);

  // Cloud nằm sẵn trong danh sách hội thoại, nên khi ensure() hỏng (đã gặp thật:
  // server trả 500) vẫn mở được bằng id lấy từ store. Trước đây hỏng là văng
  // thẳng về /chat trống — người dùng bấm icon Cloud mà rơi vào màn khác.
  const conversationIdFromList = useChatStore(
    (state) => state.conversations.find(isPersonalCloudConversation)?.id ?? null,
  );
  const resolvedId = conversationId ?? conversationIdFromList;

  useEffect(() => {
    if (conversationId) return; // đã có cache thì không cần gọi mạng
    let cancelled = false;
    cloudApi
      .ensure()
      .then((space) => {
        if (cancelled) return;
        cacheCloudConversationId(space.conversationId);
        setConversationId(space.conversationId);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [conversationId]);

  if (resolvedId) return <Navigate to={`/chat/${resolvedId}`} replace />;
  if (failed) return <Navigate to="/chat" replace />;
  return <PageSpinner />;
};

export default CloudPage;
