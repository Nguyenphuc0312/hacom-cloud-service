const SHARE_CODE_REGEX = /^[A-Za-z0-9_-]{16,64}$/;

const normalizeCodeCandidate = (value: string): string | null => {
  const nextValue = value.trim();
  if (!nextValue) {
    return null;
  }

  return SHARE_CODE_REGEX.test(nextValue) ? nextValue : null;
};

const readCodeFromUrl = (rawInput: string): string | null => {
  const nextValue = rawInput.trim();
  if (!nextValue) {
    return null;
  }

  const candidates: string[] = [];

  try {
    const parsed = new URL(nextValue);
    const queryCode = parsed.searchParams.get("code");
    if (queryCode) {
      candidates.push(queryCode);
    }

    const hashValue = parsed.hash.startsWith("#")
      ? parsed.hash.slice(1)
      : parsed.hash;
    if (hashValue) {
      const hashParams = new URLSearchParams(hashValue);
      const hashCode = hashParams.get("code");
      if (hashCode) {
        candidates.push(hashCode);
      }
    }
  } catch {
    // Ignore URL parsing errors and fallback to plain string parsing.
  }

  const codeFromInlinePair = nextValue.match(/(?:[?&#]|^)code=([^&#]+)/i);
  if (codeFromInlinePair?.[1]) {
    candidates.push(decodeURIComponent(codeFromInlinePair[1]));
  }

  for (const candidate of candidates) {
    const normalized = normalizeCodeCandidate(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

export const parseShareCodeInput = (rawInput: string): string | null => {
  const direct = normalizeCodeCandidate(rawInput);
  if (direct) {
    return direct;
  }

  return readCodeFromUrl(rawInput);
};

export const invalidQrCodeMessage =
  "Mã QR không hợp lệ hoặc đã hết hạn. Có thể người dùng đã reset mã mới.";
