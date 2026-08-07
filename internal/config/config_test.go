package config

import (
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

func setRequiredEnvironment(t *testing.T) {
	t.Helper()
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
	if cfg.HealthTimeout != 3*time.Second {
		t.Fatalf("expected 3s health timeout, got %s", cfg.HealthTimeout)
	}
	if cfg.ShutdownTimeout != 10*time.Second {
		t.Fatalf("expected 10s shutdown timeout, got %s", cfg.ShutdownTimeout)
	}
	if cfg.DefaultQuotaBytes != 5_000_000_000 {
		t.Fatalf("expected proposed 5 decimal GB quota, got %d", cfg.DefaultQuotaBytes)
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

func TestLoadRejectsDemoAuthOutsideLocal(t *testing.T) {
	setRequiredEnvironment(t)
	t.Setenv("APP_ENV", "production")
	t.Setenv("AUTH_MODE", "demo")
	if _, err := Load(); err == nil || !strings.Contains(err.Error(), "demo auth") {
		t.Fatalf("expected production demo auth rejection, got %v", err)
	}
}

func TestLoadRequiresJWTConfiguration(t *testing.T) {
	setRequiredEnvironment(t)
	t.Setenv("AUTH_MODE", "jwt")
	if _, err := Load(); err == nil || (!strings.Contains(err.Error(), "AUTH_JWKS_URL") && !strings.Contains(err.Error(), "JWT_ISSUER") && !strings.Contains(err.Error(), "JWT_AUDIENCE") && !strings.Contains(err.Error(), "AUTH_REVOCATION_URL")) {
		t.Fatalf("expected JWT configuration error, got %v", err)
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
