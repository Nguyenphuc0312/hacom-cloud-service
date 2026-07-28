package config

import (
	"strings"
	"testing"
	"time"
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
