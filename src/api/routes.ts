const TEST_FALLBACK_API_BASE_URL = '/api/v1';
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

const rawApiBaseUrl =
  import.meta.env.VITE_API_BASE_URL?.trim() ??
  import.meta.env.VITE_ADMIN_API_ROOT?.trim() ??
  import.meta.env.VITE_ADMIN_API_BASE_URL?.trim() ??
  '';
const rawAdminApiBaseUrl =
  import.meta.env.VITE_ADMIN_API_ROOT?.trim() ??
  import.meta.env.VITE_ADMIN_API_BASE_URL?.trim() ??
  '';
const rawAuthApiBaseUrl = import.meta.env.VITE_AUTH_BASE_URL?.trim() ?? '';

const resolveApiBaseUrl = (): string => {
  if (rawApiBaseUrl) {
    return stripAdminSuffix(normalizeBaseUrl(rawApiBaseUrl));
  }

  if (rawAdminApiBaseUrl) {
    return stripAdminSuffix(normalizeBaseUrl(rawAdminApiBaseUrl));
  }

  if (isTestMode) {
    return TEST_FALLBACK_API_BASE_URL;
  }

  throw new Error(
    'Missing VITE_API_BASE_URL, VITE_ADMIN_API_BASE_URL, or VITE_ADMIN_API_ROOT in environment variables.',
  );
};

const resolveAdminApiBaseUrl = (apiBaseUrl: string): string => {
  if (rawAdminApiBaseUrl) {
    return normalizeBaseUrl(rawAdminApiBaseUrl);
  }

  if (rawApiBaseUrl) {
    const normalizedLegacyBase = normalizeBaseUrl(rawApiBaseUrl);
    return normalizedLegacyBase.endsWith('/admin')
      ? normalizedLegacyBase
      : `${apiBaseUrl === '/' ? '' : apiBaseUrl}/admin`;
  }

  if (isTestMode) {
    return TEST_FALLBACK_ADMIN_API_BASE_URL;
  }

  return `${apiBaseUrl === '/' ? '' : apiBaseUrl}/admin`;
};

const resolveAuthApiBaseUrl = (apiBaseUrl: string): string => {
  if (rawAuthApiBaseUrl) {
    return normalizeBaseUrl(rawAuthApiBaseUrl);
  }

  if (isTestMode) {
    return TEST_FALLBACK_AUTH_API_BASE_URL;
  }

  return `${apiBaseUrl === '/' ? '' : apiBaseUrl}/auth`;
};

export const apiBaseUrl = resolveApiBaseUrl();
export const adminApiBaseUrl = resolveAdminApiBaseUrl(apiBaseUrl);
export const authApiBaseUrl = resolveAuthApiBaseUrl(apiBaseUrl);
