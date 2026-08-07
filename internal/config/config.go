package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

const (
	defaultMaxUploadBytes  int64 = 100_000_000
	defaultMaxContentBytes int64 = 100_000_000
	defaultQuotaLimitBytes int64 = 5_000_000_000
)

type Config struct {
	AppEnv                    string
	APIAddr                   string
	DatabaseURL               string
	MinIOEndpoint             string
	MinIOAccessKey            string
	MinIOSecretKey            string
	MinIOUseSSL               bool
	MinIOBucket               string
	MaxUploadBytes            int64
	MaxContentBytes           int64
	DefaultQuotaBytes         int64
	UploadURLTTL              time.Duration
	HealthTimeout             time.Duration
	ShutdownTimeout           time.Duration
	WorkerID                  string
	WorkerPollInterval        time.Duration
	WorkerJobTimeout          time.Duration
	WorkerLockTimeout         time.Duration
	WorkerMaxAttempts         int
	WorkerBaseBackoff         time.Duration
	WorkerMaxBackoff          time.Duration
	WorkerCleanupScanInterval time.Duration
	WorkerCleanupBatchSize    int
	AuthMode                  string
	AuthJWKSURL               string
	AuthIssuer                string
	AuthAudience              string
	AuthRevocationURL         string
	AuthRedisAddr             string
	AuthRedisPassword         string
	AuthRedisDB               int
	AuthJWKSCacheTTL          time.Duration
	AuthLegacyHS256Enabled    bool
	AuthLegacyHS256Secret     string
	AuthRateLimit             int
	AuthRateWindow            time.Duration
}

func Load() (Config, error) {
	maxUploadBytes, err := int64Env("MAX_UPLOAD_BYTES", defaultMaxUploadBytes)
	if err != nil {
		return Config{}, err
	}
	if maxUploadBytes > defaultMaxUploadBytes {
		return Config{}, fmt.Errorf(
			"MAX_UPLOAD_BYTES must not exceed the current schema limit of %d",
			defaultMaxUploadBytes,
		)
	}

	maxContentBytes, err := int64Env("MAX_CONTENT_BYTES", defaultMaxContentBytes)
	if err != nil {
		return Config{}, err
	}
	if maxContentBytes > defaultMaxContentBytes {
		return Config{}, fmt.Errorf(
			"MAX_CONTENT_BYTES must not exceed the current schema limit of %d",
			defaultMaxContentBytes,
		)
	}

	defaultQuotaBytes, err := int64Env("DEFAULT_QUOTA_BYTES", defaultQuotaLimitBytes)
	if err != nil {
		return Config{}, err
	}

	useSSL, err := boolEnv("MINIO_USE_SSL", false)
	if err != nil {
		return Config{}, err
	}

	healthTimeout, err := durationEnv("HEALTH_TIMEOUT", 3*time.Second)
	if err != nil {
		return Config{}, err
	}

	uploadURLTTL, err := durationEnv("UPLOAD_URL_TTL", 15*time.Minute)
	if err != nil {
		return Config{}, err
	}

	shutdownTimeout, err := durationEnv("SHUTDOWN_TIMEOUT", 10*time.Second)
	if err != nil {
		return Config{}, err
	}
	workerPollInterval, err := durationEnv("WORKER_POLL_INTERVAL", 2*time.Second)
	if err != nil {
		return Config{}, err
	}
	workerJobTimeout, err := durationEnv("WORKER_JOB_TIMEOUT", 5*time.Minute)
	if err != nil {
		return Config{}, err
	}
	workerLockTimeout, err := durationEnv("WORKER_LOCK_TIMEOUT", 6*time.Minute)
	if err != nil {
		return Config{}, err
	}
	if workerLockTimeout <= workerJobTimeout {
		return Config{}, fmt.Errorf("WORKER_LOCK_TIMEOUT must be greater than WORKER_JOB_TIMEOUT")
	}
	workerMaxAttempts, err := intEnv("WORKER_MAX_ATTEMPTS", 5)
	if err != nil {
		return Config{}, err
	}
	if workerMaxAttempts > 100 {
		return Config{}, fmt.Errorf("WORKER_MAX_ATTEMPTS must not exceed the schema limit of 100")
	}
	workerBaseBackoff, err := durationEnv("WORKER_BASE_BACKOFF", time.Second)
	if err != nil {
		return Config{}, err
	}
	workerMaxBackoff, err := durationEnv("WORKER_MAX_BACKOFF", time.Minute)
	if err != nil {
		return Config{}, err
	}
	if workerMaxBackoff < workerBaseBackoff {
		return Config{}, fmt.Errorf("WORKER_MAX_BACKOFF must be greater than or equal to WORKER_BASE_BACKOFF")
	}
	workerCleanupScanInterval, err := durationEnv("WORKER_CLEANUP_SCAN_INTERVAL", 30*time.Second)
	if err != nil {
		return Config{}, err
	}
	workerCleanupBatchSize, err := intEnv("WORKER_CLEANUP_BATCH_SIZE", 100)
	if err != nil {
		return Config{}, err
	}
	workerID, err := loadWorkerID()
	if err != nil {
		return Config{}, err
	}
	authMode := env("AUTH_MODE", "demo")
	if authMode != "demo" && authMode != "jwt" {
		return Config{}, fmt.Errorf("AUTH_MODE must be demo or jwt")
	}
	authLegacyHS256, err := boolEnv("AUTH_LEGACY_HS256_VERIFY_ENABLED", false)
	if err != nil {
		return Config{}, err
	}
	authJWKSCacheTTL, err := durationEnv("AUTH_JWKS_CACHE_TTL", 5*time.Minute)
	if err != nil {
		return Config{}, err
	}
	authRateLimit, err := intEnv("AUTH_RATE_LIMIT", 120)
	if err != nil {
		return Config{}, err
	}
	authRateWindow, err := durationEnv("AUTH_RATE_WINDOW", time.Minute)
	if err != nil {
		return Config{}, err
	}
	authRedisDB, err := intEnv("AUTH_REDIS_DB", 0)
	if err != nil {
		return Config{}, err
	}

	cfg := Config{
		AppEnv:                    env("APP_ENV", "local"),
		APIAddr:                   env("API_ADDR", ":8080"),
		DatabaseURL:               os.Getenv("DATABASE_URL"),
		MinIOEndpoint:             os.Getenv("MINIO_ENDPOINT"),
		MinIOAccessKey:            os.Getenv("MINIO_ACCESS_KEY"),
		MinIOSecretKey:            os.Getenv("MINIO_SECRET_KEY"),
		MinIOUseSSL:               useSSL,
		MinIOBucket:               env("MINIO_BUCKET", "hacom-cloud-private"),
		MaxUploadBytes:            maxUploadBytes,
		MaxContentBytes:           maxContentBytes,
		DefaultQuotaBytes:         defaultQuotaBytes,
		UploadURLTTL:              uploadURLTTL,
		HealthTimeout:             healthTimeout,
		ShutdownTimeout:           shutdownTimeout,
		WorkerID:                  workerID,
		WorkerPollInterval:        workerPollInterval,
		WorkerJobTimeout:          workerJobTimeout,
		WorkerLockTimeout:         workerLockTimeout,
		WorkerMaxAttempts:         workerMaxAttempts,
		WorkerBaseBackoff:         workerBaseBackoff,
		WorkerMaxBackoff:          workerMaxBackoff,
		WorkerCleanupScanInterval: workerCleanupScanInterval,
		WorkerCleanupBatchSize:    workerCleanupBatchSize,
		AuthMode:                  authMode,
		AuthJWKSURL:               os.Getenv("AUTH_JWKS_URL"),
		AuthIssuer:                os.Getenv("JWT_ISSUER"),
		AuthAudience:              os.Getenv("JWT_AUDIENCE"),
		AuthRevocationURL:         os.Getenv("AUTH_REVOCATION_URL"),
		AuthRedisAddr:             os.Getenv("AUTH_REDIS_ADDR"),
		AuthRedisPassword:         os.Getenv("AUTH_REDIS_PASSWORD"),
		AuthRedisDB:               authRedisDB,
		AuthJWKSCacheTTL:          authJWKSCacheTTL,
		AuthLegacyHS256Enabled:    authLegacyHS256,
		AuthLegacyHS256Secret:     os.Getenv("AUTH_LEGACY_HS256_SECRET"),
		AuthRateLimit:             authRateLimit,
		AuthRateWindow:            authRateWindow,
	}
	if cfg.AppEnv != "local" && cfg.AppEnv != "test" && cfg.AuthMode == "demo" {
		return Config{}, fmt.Errorf("demo auth is only allowed in local or test")
	}
	if cfg.AuthMode == "jwt" {
		for key, value := range map[string]string{"AUTH_JWKS_URL": cfg.AuthJWKSURL, "JWT_ISSUER": cfg.AuthIssuer, "JWT_AUDIENCE": cfg.AuthAudience} {
			if strings.TrimSpace(value) == "" {
				return Config{}, fmt.Errorf("%s is required when AUTH_MODE=jwt", key)
			}
		}
		if strings.TrimSpace(cfg.AuthRevocationURL) == "" && strings.TrimSpace(cfg.AuthRedisAddr) == "" {
			return Config{}, fmt.Errorf("AUTH_REVOCATION_URL or AUTH_REDIS_ADDR is required when AUTH_MODE=jwt")
		}
	}
	if cfg.AuthLegacyHS256Enabled && strings.TrimSpace(cfg.AuthLegacyHS256Secret) == "" {
		return Config{}, fmt.Errorf("AUTH_LEGACY_HS256_SECRET is required when legacy HS256 verification is enabled")
	}

	required := []struct {
		key   string
		value string
	}{
		{key: "DATABASE_URL", value: cfg.DatabaseURL},
		{key: "MINIO_ENDPOINT", value: cfg.MinIOEndpoint},
		{key: "MINIO_ACCESS_KEY", value: cfg.MinIOAccessKey},
		{key: "MINIO_SECRET_KEY", value: cfg.MinIOSecretKey},
	}
	for _, item := range required {
		if item.value == "" {
			return Config{}, fmt.Errorf("%s is required", item.key)
		}
	}

	return cfg, nil
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func int64Env(key string, fallback int64) (int64, error) {
	value := os.Getenv(key)
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil || parsed <= 0 {
		return 0, fmt.Errorf("%s must be a positive integer", key)
	}
	return parsed, nil
}

func intEnv(key string, fallback int) (int, error) {
	value := os.Getenv(key)
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return 0, fmt.Errorf("%s must be a positive integer", key)
	}
	return parsed, nil
}

func boolEnv(key string, fallback bool) (bool, error) {
	value := os.Getenv(key)
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return false, fmt.Errorf("%s must be a boolean: %w", key, err)
	}
	return parsed, nil
}

func durationEnv(key string, fallback time.Duration) (time.Duration, error) {
	value := os.Getenv(key)
	if value == "" {
		return fallback, nil
	}
	parsed, err := time.ParseDuration(value)
	if err != nil || parsed <= 0 {
		return 0, fmt.Errorf("%s must be a positive duration", key)
	}
	return parsed, nil
}

func loadWorkerID() (string, error) {
	if value := strings.TrimSpace(os.Getenv("WORKER_ID")); value != "" {
		if len(value) > 128 {
			return "", fmt.Errorf("WORKER_ID must not exceed 128 characters")
		}
		return value, nil
	}
	hostname, err := os.Hostname()
	if err != nil {
		return "", fmt.Errorf("get hostname for WORKER_ID: %w", err)
	}
	hostname = strings.TrimSpace(hostname)
	if hostname == "" {
		hostname = "worker"
	}
	const uuidLength = 36
	maxHostnameLength := 128 - uuidLength - 1
	if len(hostname) > maxHostnameLength {
		hostname = hostname[:maxHostnameLength]
	}
	return hostname + "-" + uuid.NewString(), nil
}
