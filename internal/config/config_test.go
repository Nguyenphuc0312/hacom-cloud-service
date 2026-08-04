package config

import (
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

func setRequiredEnvironment(t *testing.T) {
	t.Helper()
	t.Setenv("APP_ENV", "local")
	t.Setenv("AUTH_MODE", "demo")
	t.Setenv("AUTH_JWKS_URL", "")
	t.Setenv("AUTH_ISSUER", "")
	t.Setenv("AUTH_AUDIENCE", "")
	t.Setenv("AUTH_JWKS_CACHE_TTL", "")
	t.Setenv("AUTH_HTTP_TIMEOUT", "")
	t.Setenv("AUTH_REDIS_URL", "")
	t.Setenv("AUTH_REVOCATION_TIMEOUT", "")
	t.Setenv("AUTH_LEGACY_HS256_VERIFY_ENABLED", "")
	t.Setenv("AUTH_LEGACY_HS256_SECRET", "")
	t.Setenv("AUTH_VERIFICATION_CONTRACT_URL", "")
	t.Setenv("AUTH_ACCOUNT_STATE_URL", "")
	t.Setenv("AUTH_SERVICE_TOKEN_URL", "")
	t.Setenv("AUTH_SERVICE_CLIENT_ID", "")
	t.Setenv("AUTH_SERVICE_CLIENT_SECRET", "")
	t.Setenv("AUTH_SERVICE_TOKEN_AUDIENCE", "")
	t.Setenv("AUTH_SERVICE_TOKEN_SCOPES", "")
	t.Setenv("SEARCH_QUERY_TIMEOUT", "")
	t.Setenv("QUOTA_REQUEST_TIERS_BYTES", "")
	t.Setenv("DATABASE_URL", "postgres://hacom:hacom@localhost:5432/hacom_cloud?sslmode=disable")
	t.Setenv("MINIO_ENDPOINT", "localhost:9000")
	t.Setenv("MINIO_ACCESS_KEY", "minioadmin")
	t.Setenv("MINIO_SECRET_KEY", "minioadmin")
}

func TestLoadUsesHealthDefaults(t *testing.T) {
	setRequiredEnvironment(t)

	cfg, err := Load()
	if err != nil {
		t.Fatalf("load config: %v", err)
	}

	if cfg.APIAddr != ":8080" {
		t.Fatalf("expected default API address, got %q", cfg.APIAddr)
	}
	if cfg.AuthMode != "demo" {
		t.Fatalf("expected local demo auth mode, got %q", cfg.AuthMode)
	}
	if cfg.HealthTimeout != 3*time.Second {
		t.Fatalf("expected 3s health timeout, got %s", cfg.HealthTimeout)
	}
	if cfg.SearchQueryTimeout != 2*time.Second {
		t.Fatalf("expected 2s search query timeout, got %s", cfg.SearchQueryTimeout)
	}
	if cfg.ShutdownTimeout != 10*time.Second {
		t.Fatalf("expected 10s shutdown timeout, got %s", cfg.ShutdownTimeout)
	}
	if cfg.DefaultQuotaBytes != 5_000_000_000 {
		t.Fatalf("expected proposed 5 decimal GB quota, got %d", cfg.DefaultQuotaBytes)
	}
	if len(cfg.QuotaRequestTiersBytes) != 3 || cfg.QuotaRequestTiersBytes[0] != 10_000_000_000 ||
		cfg.QuotaRequestTiersBytes[2] != 50_000_000_000 {
		t.Fatalf("quota request tiers=%v", cfg.QuotaRequestTiersBytes)
	}
	if cfg.MaxUploadBytes != 100_000_000 {
		t.Fatalf("expected proposed 100 decimal MB upload limit, got %d", cfg.MaxUploadBytes)
	}
	if cfg.MaxContentBytes != 100_000_000 {
		t.Fatalf("expected proposed 100 decimal MB content limit, got %d", cfg.MaxContentBytes)
	}
	if cfg.UploadURLTTL != 15*time.Minute {
		t.Fatalf("expected 15m upload URL TTL, got %s", cfg.UploadURLTTL)
	}
	if cfg.DownloadURLTTL != 15*time.Minute {
		t.Fatalf("expected 15m download URL TTL, got %s", cfg.DownloadURLTTL)
	}
	if cfg.WorkerPollInterval != 2*time.Second {
		t.Fatalf("worker poll interval = %s", cfg.WorkerPollInterval)
	}
	if cfg.WorkerJobTimeout != 5*time.Minute {
		t.Fatalf("worker job timeout = %s", cfg.WorkerJobTimeout)
	}
	if cfg.WorkerLockTimeout != 6*time.Minute {
		t.Fatalf("worker lock timeout = %s", cfg.WorkerLockTimeout)
	}
	if cfg.WorkerMaxAttempts != 5 {
		t.Fatalf("worker max attempts = %d", cfg.WorkerMaxAttempts)
	}
	if cfg.WorkerBaseBackoff != time.Second {
		t.Fatalf("worker base backoff = %s", cfg.WorkerBaseBackoff)
	}
	if cfg.WorkerMaxBackoff != time.Minute {
		t.Fatalf("worker max backoff = %s", cfg.WorkerMaxBackoff)
	}
	if cfg.WorkerCleanupScanInterval != 30*time.Second {
		t.Fatalf("worker cleanup scan interval = %s", cfg.WorkerCleanupScanInterval)
	}
	if cfg.WorkerCleanupBatchSize != 100 {
		t.Fatalf("worker cleanup batch size = %d", cfg.WorkerCleanupBatchSize)
	}
	parts := strings.Split(cfg.WorkerID, "-")
	if len(parts) < 2 {
		t.Fatalf("generated worker ID = %q", cfg.WorkerID)
	}
	if _, err := uuid.Parse(strings.Join(parts[len(parts)-5:], "-")); err != nil {
		t.Fatalf("generated worker ID %q does not end with a UUID: %v", cfg.WorkerID, err)
	}
}

func TestLoadRejectsDemoAuthOutsideLocalOrTest(t *testing.T) {
	setRequiredEnvironment(t)
	t.Setenv("APP_ENV", "production")
	t.Setenv("AUTH_MODE", "demo")

	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "only allowed") {
		t.Fatalf("expected unsafe demo auth error, got %v", err)
	}
}

func TestLoadDefaultsToJWTOutsideLocal(t *testing.T) {
	setRequiredEnvironment(t)
	t.Setenv("APP_ENV", "production")
	t.Setenv("AUTH_MODE", "")

	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "AUTH_JWKS_URL") {
		t.Fatalf("expected production JWT configuration error, got %v", err)
	}
}

func TestLoadReadsJWTAuthConfiguration(t *testing.T) {
	setRequiredEnvironment(t)
	t.Setenv("APP_ENV", "production")
	t.Setenv("AUTH_MODE", "jwt")
	t.Setenv("AUTH_JWKS_URL", "https://chat.hacomholdings.com.vn/api/v1/auth/.well-known/jwks.json")
	t.Setenv("AUTH_ISSUER", "chat-service")
	t.Setenv("AUTH_AUDIENCE", "chat-service, hacom-cloud,chat-service")
	t.Setenv("AUTH_REDIS_URL", "rediss://redis.example.test:6379/0")
	t.Setenv("AUTH_JWKS_CACHE_TTL", "10m")
	t.Setenv("AUTH_HTTP_TIMEOUT", "4s")
	t.Setenv("AUTH_REVOCATION_TIMEOUT", "750ms")
	t.Setenv("AUTH_VERIFICATION_CONTRACT_URL", "https://auth.example.test/internal/v1/auth/verification-contract")
	t.Setenv("AUTH_ACCOUNT_STATE_URL", "https://auth.example.test/internal/v1/auth/check-account-state")
	t.Setenv("AUTH_SERVICE_TOKEN_URL", "https://auth.example.test/internal/v1/auth/service-token")
	t.Setenv("AUTH_SERVICE_CLIENT_ID", "hacom-cloud-service")
	t.Setenv("AUTH_SERVICE_CLIENT_SECRET", "test-service-secret")
	t.Setenv("AUTH_SERVICE_TOKEN_AUDIENCE", "chat-auth-service")
	t.Setenv("AUTH_SERVICE_TOKEN_SCOPES", "auth.user.read, auth.user.read")

	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.AuthMode != "jwt" || cfg.AuthIssuer != "chat-service" {
		t.Fatalf("unexpected auth config: %+v", cfg)
	}
	if len(cfg.AuthAudiences) != 2 || cfg.AuthAudiences[0] != "chat-service" || cfg.AuthAudiences[1] != "hacom-cloud" {
		t.Fatalf("auth audiences = %v", cfg.AuthAudiences)
	}
	if cfg.AuthJWKSCacheTTL != 10*time.Minute || cfg.AuthHTTPTimeout != 4*time.Second || cfg.AuthRevocationTimeout != 750*time.Millisecond {
		t.Fatalf("unexpected auth durations: cache=%s http=%s revocation=%s", cfg.AuthJWKSCacheTTL, cfg.AuthHTTPTimeout, cfg.AuthRevocationTimeout)
	}
	if cfg.AuthServiceTokenURL != "https://auth.example.test/internal/v1/auth/service-token" ||
		cfg.AuthServiceClientID != "hacom-cloud-service" || len(cfg.AuthServiceTokenScopes) != 1 {
		t.Fatalf("unexpected Auth authority config: %+v", cfg)
	}
}

func TestLoadRejectsJWTWithoutAccountAuthority(t *testing.T) {
	setRequiredEnvironment(t)
	t.Setenv("AUTH_MODE", "jwt")
	t.Setenv("AUTH_JWKS_URL", "https://auth.example.test/.well-known/jwks.json")
	t.Setenv("AUTH_ISSUER", "chat-service")
	t.Setenv("AUTH_AUDIENCE", "chat-service")
	t.Setenv("AUTH_REDIS_URL", "redis://localhost:6379/0")

	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "AUTH_VERIFICATION_CONTRACT_URL") {
		t.Fatalf("expected account authority configuration error, got %v", err)
	}
}

func TestLoadRejectsJWTWithoutRevocationAuthority(t *testing.T) {
	setRequiredEnvironment(t)
	t.Setenv("AUTH_MODE", "jwt")
	t.Setenv("AUTH_JWKS_URL", "https://auth.example.test/.well-known/jwks.json")
	t.Setenv("AUTH_ISSUER", "chat-service")
	t.Setenv("AUTH_AUDIENCE", "chat-service")
	t.Setenv("AUTH_REDIS_URL", "")

	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "AUTH_REDIS_URL") {
		t.Fatalf("expected revocation authority error, got %v", err)
	}
}

func TestLoadRejectsWeakLegacyHS256Secret(t *testing.T) {
	setRequiredEnvironment(t)
	t.Setenv("AUTH_MODE", "jwt")
	t.Setenv("AUTH_JWKS_URL", "https://auth.example.test/.well-known/jwks.json")
	t.Setenv("AUTH_ISSUER", "chat-service")
	t.Setenv("AUTH_AUDIENCE", "chat-service")
	t.Setenv("AUTH_REDIS_URL", "redis://localhost:6379/0")
	t.Setenv("AUTH_LEGACY_HS256_VERIFY_ENABLED", "true")
	t.Setenv("AUTH_LEGACY_HS256_SECRET", "too-short")

	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "at least 32 bytes") {
		t.Fatalf("expected weak legacy secret error, got %v", err)
	}
}

func TestLoadRejectsMissingDependencyConfiguration(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	t.Setenv("MINIO_ENDPOINT", "")
	t.Setenv("MINIO_ACCESS_KEY", "")
	t.Setenv("MINIO_SECRET_KEY", "")

	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "DATABASE_URL") {
		t.Fatalf("expected missing DATABASE_URL error, got %v", err)
	}
}

func TestLoadRejectsInvalidHealthTimeout(t *testing.T) {
	setRequiredEnvironment(t)
	t.Setenv("HEALTH_TIMEOUT", "invalid")

	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "HEALTH_TIMEOUT") {
		t.Fatalf("expected invalid HEALTH_TIMEOUT error, got %v", err)
	}
}

func TestLoadRejectsUnsafeSearchQueryTimeout(t *testing.T) {
	setRequiredEnvironment(t)
	for _, value := range []string{"invalid", "11s"} {
		t.Setenv("SEARCH_QUERY_TIMEOUT", value)
		if _, err := Load(); err == nil || !strings.Contains(err.Error(), "SEARCH_QUERY_TIMEOUT") {
			t.Fatalf("value=%q error=%v", value, err)
		}
	}
}

func TestLoadValidatesIntegerQuotaRequestTiers(t *testing.T) {
	for _, value := range []string{"10.5", "0,10000000000", "10000000000,10000000000", "1000000000"} {
		setRequiredEnvironment(t)
		t.Setenv("QUOTA_REQUEST_TIERS_BYTES", value)
		if _, err := Load(); err == nil || !strings.Contains(err.Error(), "QUOTA_REQUEST_TIERS_BYTES") {
			t.Fatalf("value=%q error=%v", value, err)
		}
	}
}

func TestLoadReadsConfigurableQuotaAndContentLimits(t *testing.T) {
	setRequiredEnvironment(t)
	t.Setenv("DEFAULT_QUOTA_BYTES", "7000000000")
	t.Setenv("MAX_UPLOAD_BYTES", "25000000")
	t.Setenv("MAX_CONTENT_BYTES", "15000000")

	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.DefaultQuotaBytes != 7_000_000_000 {
		t.Fatalf("quota bytes = %d", cfg.DefaultQuotaBytes)
	}
	if cfg.MaxUploadBytes != 25_000_000 {
		t.Fatalf("maximum upload bytes = %d", cfg.MaxUploadBytes)
	}
	if cfg.MaxContentBytes != 15_000_000 {
		t.Fatalf("maximum content bytes = %d", cfg.MaxContentBytes)
	}
}

func TestLoadRejectsLimitsAboveCurrentSchema(t *testing.T) {
	setRequiredEnvironment(t)
	t.Setenv("MAX_CONTENT_BYTES", "100000001")

	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "current schema limit") {
		t.Fatalf("expected schema limit error, got %v", err)
	}
}

func TestLoadReadsWorkerConfiguration(t *testing.T) {
	setRequiredEnvironment(t)
	t.Setenv("WORKER_ID", "worker-integration-1")
	t.Setenv("WORKER_POLL_INTERVAL", "25ms")
	t.Setenv("WORKER_JOB_TIMEOUT", "10s")
	t.Setenv("WORKER_LOCK_TIMEOUT", "15s")
	t.Setenv("WORKER_MAX_ATTEMPTS", "7")
	t.Setenv("WORKER_BASE_BACKOFF", "250ms")
	t.Setenv("WORKER_MAX_BACKOFF", "30s")
	t.Setenv("WORKER_CLEANUP_SCAN_INTERVAL", "5s")
	t.Setenv("WORKER_CLEANUP_BATCH_SIZE", "25")
	t.Setenv("TRASH_RETENTION", "24h")
	t.Setenv("WORKER_TRASH_SCAN_INTERVAL", "7s")
	t.Setenv("WORKER_TRASH_BATCH_SIZE", "40")
	t.Setenv("WORKER_METRICS_ADDR", "127.0.0.1:19091")

	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.WorkerID != "worker-integration-1" {
		t.Fatalf("worker ID = %q", cfg.WorkerID)
	}
	if cfg.WorkerPollInterval != 25*time.Millisecond {
		t.Fatalf("worker poll interval = %s", cfg.WorkerPollInterval)
	}
	if cfg.WorkerJobTimeout != 10*time.Second {
		t.Fatalf("worker job timeout = %s", cfg.WorkerJobTimeout)
	}
	if cfg.WorkerLockTimeout != 15*time.Second {
		t.Fatalf("worker lock timeout = %s", cfg.WorkerLockTimeout)
	}
	if cfg.WorkerMaxAttempts != 7 {
		t.Fatalf("worker max attempts = %d", cfg.WorkerMaxAttempts)
	}
	if cfg.WorkerBaseBackoff != 250*time.Millisecond {
		t.Fatalf("worker base backoff = %s", cfg.WorkerBaseBackoff)
	}
	if cfg.WorkerMaxBackoff != 30*time.Second {
		t.Fatalf("worker max backoff = %s", cfg.WorkerMaxBackoff)
	}
	if cfg.WorkerCleanupScanInterval != 5*time.Second {
		t.Fatalf("worker cleanup scan interval = %s", cfg.WorkerCleanupScanInterval)
	}
	if cfg.WorkerCleanupBatchSize != 25 {
		t.Fatalf("worker cleanup batch size = %d", cfg.WorkerCleanupBatchSize)
	}
	if cfg.TrashRetention != 24*time.Hour ||
		cfg.WorkerTrashScanInterval != 7*time.Second ||
		cfg.WorkerTrashBatchSize != 40 ||
		cfg.WorkerMetricsAddr != "127.0.0.1:19091" {
		t.Fatalf("Trash Worker config=%+v", cfg)
	}
}

func TestLoadRejectsTrashRetentionOtherThanTwentyFourHours(t *testing.T) {
	setRequiredEnvironment(t)
	t.Setenv("TRASH_RETENTION", "23h")
	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "exactly 24h") {
		t.Fatalf("expected retention contract error, got %v", err)
	}
}

func TestLoadRejectsTrashBatchAboveSafetyLimit(t *testing.T) {
	setRequiredEnvironment(t)
	t.Setenv("WORKER_TRASH_BATCH_SIZE", "1001")
	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "WORKER_TRASH_BATCH_SIZE") {
		t.Fatalf("expected Trash batch error, got %v", err)
	}
}

func TestLoadRejectsUnsafeWorkerTimeouts(t *testing.T) {
	setRequiredEnvironment(t)
	t.Setenv("WORKER_JOB_TIMEOUT", "1m")
	t.Setenv("WORKER_LOCK_TIMEOUT", "1m")

	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "WORKER_LOCK_TIMEOUT") {
		t.Fatalf("expected unsafe lock timeout error, got %v", err)
	}
}

func TestLoadRejectsInvalidWorkerRetryConfiguration(t *testing.T) {
	setRequiredEnvironment(t)
	t.Setenv("WORKER_BASE_BACKOFF", "2m")
	t.Setenv("WORKER_MAX_BACKOFF", "1m")

	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "WORKER_MAX_BACKOFF") {
		t.Fatalf("expected invalid backoff error, got %v", err)
	}
}

func TestLoadRejectsWorkerAttemptsAboveSchemaLimit(t *testing.T) {
	setRequiredEnvironment(t)
	t.Setenv("WORKER_MAX_ATTEMPTS", "101")

	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "schema limit") {
		t.Fatalf("expected max attempts schema limit error, got %v", err)
	}
}

func TestLoadRejectsLongWorkerID(t *testing.T) {
	setRequiredEnvironment(t)
	t.Setenv("WORKER_ID", strings.Repeat("x", 129))

	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "WORKER_ID") {
		t.Fatalf("expected invalid worker ID error, got %v", err)
	}
}
