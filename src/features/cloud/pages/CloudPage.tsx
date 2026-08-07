import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { cloudApi } from '../api/cloudApi';
// Import thẳng file, không qua barrel components/ui — barrel đó nằm trong các vòng
// import sẵn có (xem CLAUDE.md mục 13).
import { PageSpinner } from '../../../components/ui/Spinner';

/**
 * "Cloud của tôi" sống trong danh sách hội thoại như mọi cuộc trò chuyện khác.
 * /cloud chỉ còn là lối tắt (icon rail, bookmark cũ): giải id rồi nhường cho /chat/<id>.
 */
export const CloudPage = () => {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    cloudApi
      .ensure()
      .then((space) => { if (!cancelled) setConversationId(space.conversationId); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  if (failed) return <Navigate to="/chat" replace />;
  if (!conversationId) return <PageSpinner />;
  return <Navigate to={`/chat/${conversationId}`} replace />;
};

export default CloudPage;
