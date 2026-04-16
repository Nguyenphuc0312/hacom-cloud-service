const TEST_FALLBACK_ADMIN_API_BASE_URL = '/api/v1/admin';
const TEST_FALLBACK_AUTH_API_BASE_URL = '/api/v1/auth';

const normalizeBaseUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/+$/, '');
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const normalized = withLeadingSlash.replace(/\/+$/, '');
  return normalized || '/';
};

const stripAdminSuffix = (value: string): string => {
  if (value === '/admin') {
    return '/';
  }

  return value.endsWith('/admin') ? value.slice(0, -'/admin'.length) || '/' : value;
};

const isTestMode = import.meta.env.MODE === 'test';

const rawAdminApiBaseUrl =
  import.meta.env.VITE_ADMIN_API_ROOT?.trim() ??
  import.meta.env.VITE_ADMIN_API_BASE_URL?.trim() ??
  '';
const rawLegacyApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() ?? '';
const rawAuthApiBaseUrl = import.meta.env.VITE_AUTH_BASE_URL?.trim() ?? '';

const resolveAdminApiBaseUrl = (): string => {
  if (rawAdminApiBaseUrl) {
    return normalizeBaseUrl(rawAdminApiBaseUrl);
  }

  if (rawLegacyApiBaseUrl) {
    const normalizedLegacyBase = normalizeBaseUrl(rawLegacyApiBaseUrl);
    return normalizedLegacyBase.endsWith('/admin')
      ? normalizedLegacyBase
      : `${normalizedLegacyBase === '/' ? '' : normalizedLegacyBase}/admin`;
  }

  return TEST_FALLBACK_ADMIN_API_BASE_URL;
};

const resolveAuthApiBaseUrl = (adminApiBaseUrl: string): string => {
  if (rawAuthApiBaseUrl) {
    return normalizeBaseUrl(rawAuthApiBaseUrl);
  }

  if (rawLegacyApiBaseUrl) {
    const legacyApiBaseUrl = stripAdminSuffix(normalizeBaseUrl(rawLegacyApiBaseUrl));
    return `${legacyApiBaseUrl === '/' ? '' : legacyApiBaseUrl}/auth`;
  }

  if (isTestMode) {
    return TEST_FALLBACK_AUTH_API_BASE_URL;
  }

  const canonicalApiBaseUrl = stripAdminSuffix(adminApiBaseUrl);
  return `${canonicalApiBaseUrl === '/' ? '' : canonicalApiBaseUrl}/auth`;
};

export const adminApiBaseUrl = resolveAdminApiBaseUrl();
export const authApiBaseUrl = resolveAuthApiBaseUrl(adminApiBaseUrl);
