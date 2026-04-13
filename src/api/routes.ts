const TEST_FALLBACK_API_BASE_URL = '/api/v1';
const TEST_FALLBACK_ADMIN_API_ROOT = '/api/v1/admin';

const normalizeBasePath = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
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

const rawApiBaseUrl = import.meta.env.VITE_ADMIN_API_BASE_URL?.trim() ?? '';
const rawAdminApiRoot = import.meta.env.VITE_ADMIN_API_ROOT?.trim() ?? '';

const resolveApiBaseUrl = (): string => {
  if (rawApiBaseUrl) {
    return stripAdminSuffix(normalizeBasePath(rawApiBaseUrl));
  }

  if (rawAdminApiRoot) {
    return stripAdminSuffix(normalizeBasePath(rawAdminApiRoot));
  }

  if (isTestMode) {
    return TEST_FALLBACK_API_BASE_URL;
  }

  throw new Error(
    'Missing VITE_ADMIN_API_ROOT or VITE_ADMIN_API_BASE_URL in environment variables.',
  );
};

const resolveAdminApiRoot = (apiBaseUrl: string): string => {
  if (rawAdminApiRoot) {
    return normalizeBasePath(rawAdminApiRoot);
  }

  if (rawApiBaseUrl) {
    const normalizedLegacyBase = normalizeBasePath(rawApiBaseUrl);
    return normalizedLegacyBase.endsWith('/admin')
      ? normalizedLegacyBase
      : `${apiBaseUrl === '/' ? '' : apiBaseUrl}/admin`;
  }

  if (isTestMode) {
    return TEST_FALLBACK_ADMIN_API_ROOT;
  }

  return `${apiBaseUrl === '/' ? '' : apiBaseUrl}/admin`;
};

const normalizeResourcePath = (path: string): string => (path.startsWith('/') ? path : `/${path}`);

export const apiBaseUrl = resolveApiBaseUrl();
export const adminApiRoot = resolveAdminApiRoot(apiBaseUrl);

export const adminApiPath = (path: string): string => `${adminApiRoot}${normalizeResourcePath(path)}`;
