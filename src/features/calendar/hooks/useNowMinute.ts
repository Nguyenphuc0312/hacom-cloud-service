/**
 * useNowMinute — trả phút hiện tại (từ nửa đêm local), tự cập nhật mỗi phút.
 * Dùng cho current-time indicator ở Day/Week View (FR-D2/FR-CTI).
 * Đồng bộ vào đầu phút kế tiếp để line nhích đúng nhịp.
 */

import { useEffect, useState } from "react";
import { nowMinutes } from "../utils/timeline";

export const useNowMinute = (): number => {
  const [minute, setMinute] = useState<number>(() => nowMinutes());

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined;

    // Căn tới ranh giới phút kế tiếp rồi mới bật interval 60s.
    const msToNextMinute = (60 - new Date().getSeconds()) * 1000;
    const timeoutId = setTimeout(() => {
      setMinute(nowMinutes());
      intervalId = setInterval(() => setMinute(nowMinutes()), 60_000);
    }, msToNextMinute);

    return () => {
      clearTimeout(timeoutId);
      if (intervalId !== undefined) clearInterval(intervalId);
    };
  }, []);

  return minute;
};

export default useNowMinute;
