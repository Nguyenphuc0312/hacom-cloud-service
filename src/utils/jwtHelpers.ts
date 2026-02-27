export const isJwtLike = (t: unknown): t is string => {
  if (typeof t !== "string") return false;
  const s = t.trim();
  if (!s) return false;
  // JWT phải có đúng 3 segment
  return s.split(".").length === 3;
};

export const normalizeToken = (t: string) =>
  t.trim().replace(/^Bearer\s+/i, "");
