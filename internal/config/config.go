package config

import (
	"fmt"
	"net/url"
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
	AppEnv                      string
	APIAddr                     string
	AuthMode                    string
	AuthJWKSURL                 string
	AuthIssuer                  string
	AuthAudiences               []string
	AuthJWKSCacheTTL            time.Duration
	AuthHTTPTimeout             time.Duration
	AuthRedisURL                string
	AuthRevocationTimeout       time.Duration
	AuthLegacyHS256Enabled      bool
	AuthLegacyHS256Secret       string
	AuthVerificationContractURL string
	AuthAccountStateURL         string
	AuthServiceTokenURL         string
	AuthServiceClientID         string
	AuthServiceClientSecret     string
	AuthServiceTokenAudience    string
	AuthServiceTokenScopes      []string
	DatabaseURL                 string
	MinIOEndpoint               string
	MinIOAccessKey              string
	MinIOSecretKey              string
	MinIOUseSSL                 bool
	MinIOBucket                 string
	MaxUploadBytes              int64
	MaxContentBytes             int64
	DefaultQuotaBytes           int64
	UploadURLTTL                time.Duration
	DownloadURLTTL              time.Duration
	HealthTimeout               time.Duration
	ShutdownTimeout             time.Duration
	WorkerID                    string
	WorkerPollInterval          time.Duration
	WorkerJobTimeout            time.Duration
	WorkerLockTimeout           time.Duration
	WorkerMaxAttempts           int
	WorkerBaseBackoff           time.Duration
	WorkerMaxBackoff            time.Duration
	WorkerCleanupScanInterval   time.Duration
	WorkerCleanupBatchSize      int
}

func Load() (Config, error) {
	appEnv := strings.ToLower(strings.TrimSpace(env("APP_ENV", "local")))
	authMode, err := loadAuthMode(appEnv)
	if err != nil {
		return Config{}, err
	}
	authJWKSCacheTTL, err := durationEnv("AUTH_JWKS_CACHE_TTL", 5*time.Minute)
	if err != nil {
		return Config{}, err
	}
	authHTTPTimeout, err := durationEnv("AUTH_HTTP_TIMEOUT", 3*time.Second)
	if err != nil {
		return Config{}, err
	}
	authRevocationTimeout, err := durationEnv("AUTH_REVOCATION_TIMEOUT", 500*time.Millisecond)
	if err != nil {
		return Config{}, err
	}
	authLegacyHS256Enabled, err := boolEnv("AUTH_LEGACY_HS256_VERIFY_ENABLED", false)
	if err != nil {
		return Config{}, err
	}
	authJWKSURL := strings.TrimSpace(os.Getenv("AUTH_JWKS_URL"))
	authIssuer := strings.TrimSpace(os.Getenv("AUTH_ISSUER"))
	authAudiences := splitCSV(os.Getenv("AUTH_AUDIENCE"))
	authRedisURL := strings.TrimSpace(os.Getenv("AUTH_REDIS_URL"))
	authLegacyHS256Secret := os.Getenv("AUTH_LEGACY_HS256_SECRET")
	authVerificationContractURL := strings.TrimSpace(os.Getenv("AUTH_VERIFICATION_CONTRACT_URL"))
	authAccountStateURL := strings.TrimSpace(os.Getenv("AUTH_ACCOUNT_STATE_URL"))
	authServiceTokenURL := strings.TrimSpace(os.Getenv("AUTH_SERVICE_TOKEN_URL"))
	authServiceClientID := strings.TrimSpace(os.Getenv("AUTH_SERVICE_CLIENT_ID"))
	authServiceClientSecret := os.Getenv("AUTH_SERVICE_CLIENT_SECRET")
	authServiceTokenAudience := strings.TrimSpace(os.Getenv("AUTH_SERVICE_TOKEN_AUDIENCE"))
	authServiceTokenScopes := splitCSV(os.Getenv("AUTH_SERVICE_TOKEN_SCOPES"))
	if authMode == "jwt" {
		if err := validateJWTAuthConfig(
			authJWKSURL,
			authIssuer,
			authAudiences,
			authRedisURL,
			authLegacyHS256Enabled,
			authLegacyHS256Secret,
			authVerificationContractURL,
			authAccountStateURL,
			authServiceTokenURL,
			authServiceClientID,
			authServiceClientSecret,
			authServiceTokenAudience,
		); err != nil {
			return Config{}, err
		}
	}

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
	downloadURLTTL, err := durationEnv("DOWNLOAD_URL_TTL", 15*time.Minute)
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

	cfg := Config{
		AppEnv:                      appEnv,
		APIAddr:                     env("API_ADDR", ":8080"),
		AuthMode:                    authMode,
		AuthJWKSURL:                 authJWKSURL,
		AuthIssuer:                  authIssuer,
		AuthAudiences:               authAudiences,
		AuthJWKSCacheTTL:            authJWKSCacheTTL,
		AuthHTTPTimeout:             authHTTPTimeout,
		AuthRedisURL:                authRedisURL,
		AuthRevocationTimeout:       authRevocationTimeout,
		AuthLegacyHS256Enabled:      authLegacyHS256Enabled,
		AuthLegacyHS256Secret:       authLegacyHS256Secret,
		AuthVerificationContractURL: authVerificationContractURL,
		AuthAccountStateURL:         authAccountStateURL,
		AuthServiceTokenURL:         authServiceTokenURL,
		AuthServiceClientID:         authServiceClientID,
		AuthServiceClientSecret:     authServiceClientSecret,
		AuthServiceTokenAudience:    authServiceTokenAudience,
		AuthServiceTokenScopes:      authServiceTokenScopes,
		DatabaseURL:                 os.Getenv("DATABASE_URL"),
		MinIOEndpoint:               os.Getenv("MINIO_ENDPOINT"),
		MinIOAccessKey:              os.Getenv("MINIO_ACCESS_KEY"),
		MinIOSecretKey:              os.Getenv("MINIO_SECRET_KEY"),
		MinIOUseSSL:                 useSSL,
		MinIOBucket:                 env("MINIO_BUCKET", "hacom-cloud-private"),
		MaxUploadBytes:              maxUploadBytes,
		MaxContentBytes:             maxContentBytes,
		DefaultQuotaBytes:           defaultQuotaBytes,
		UploadURLTTL:                uploadURLTTL,
		DownloadURLTTL:              downloadURLTTL,
		HealthTimeout:               healthTimeout,
		ShutdownTimeout:             shutdownTimeout,
		WorkerID:                    workerID,
		WorkerPollInterval:          workerPollInterval,
		WorkerJobTimeout:            workerJobTimeout,
		WorkerLockTimeout:           workerLockTimeout,
		WorkerMaxAttempts:           workerMaxAttempts,
		WorkerBaseBackoff:           workerBaseBackoff,
		WorkerMaxBackoff:            workerMaxBackoff,
		WorkerCleanupScanInterval:   workerCleanupScanInterval,
		WorkerCleanupBatchSize:      workerCleanupBatchSize,
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

func loadAuthMode(appEnv string) (string, error) {
	mode := strings.ToLower(strings.TrimSpace(os.Getenv("AUTH_MODE")))
	if mode == "" {
		if appEnv == "local" || appEnv == "test" {
			return "demo", nil
		}
		return "jwt", nil
	}
	if mode != "demo" && mode != "jwt" {
		return "", fmt.Errorf("AUTH_MODE must be demo or jwt")
	}
	if mode == "demo" && appEnv != "local" && appEnv != "test" {
		return "", fmt.Errorf("AUTH_MODE=demo is only allowed when APP_ENV is local or test")
	}
	return mode, nil
}

func validateJWTAuthConfig(
	jwksURL string,
	issuer string,
	audiences []string,
	redisURL string,
	legacyHS256Enabled bool,
	legacyHS256Secret string,
	verificationContractURL string,
	accountStateURL string,
	serviceTokenURL string,
	serviceClientID string,
	serviceClientSecret string,
	serviceTokenAudience string,
) error {
	if jwksURL == "" {
		return fmt.Errorf("AUTH_JWKS_URL is required when AUTH_MODE=jwt")
	}
	parsedJWKSURL, err := url.Parse(jwksURL)
	if err != nil || (parsedJWKSURL.Scheme != "http" && parsedJWKSURL.Scheme != "https") || parsedJWKSURL.Host == "" {
		return fmt.Errorf("AUTH_JWKS_URL must be an absolute http or https URL")
	}
	if issuer == "" {
		return fmt.Errorf("AUTH_ISSUER is required when AUTH_MODE=jwt")
	}
	if len(audiences) == 0 {
		return fmt.Errorf("AUTH_AUDIENCE is required when AUTH_MODE=jwt")
	}
	if redisURL == "" {
		return fmt.Errorf("AUTH_REDIS_URL is required when AUTH_MODE=jwt")
	}
	parsedRedisURL, err := url.Parse(redisURL)
	if err != nil || (parsedRedisURL.Scheme != "redis" && parsedRedisURL.Scheme != "rediss") || parsedRedisURL.Host == "" {
		return fmt.Errorf("AUTH_REDIS_URL must be an absolute redis or rediss URL")
	}
	if legacyHS256Enabled && len(legacyHS256Secret) < 32 {
		return fmt.Errorf("AUTH_LEGACY_HS256_SECRET must contain at least 32 bytes when legacy verification is enabled")
	}
	for _, endpoint := range []struct {
		key   string
		value string
	}{
		{key: "AUTH_VERIFICATION_CONTRACT_URL", value: verificationContractURL},
		{key: "AUTH_ACCOUNT_STATE_URL", value: accountStateURL},
		{key: "AUTH_SERVICE_TOKEN_URL", value: serviceTokenURL},
	} {
		if endpoint.value == "" {
			return fmt.Errorf("%s is required when AUTH_MODE=jwt", endpoint.key)
		}
		parsed, err := url.Parse(endpoint.value)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
			return fmt.Errorf("%s must be an absolute http or https URL", endpoint.key)
		}
	}
	if serviceClientID == "" {
		return fmt.Errorf("AUTH_SERVICE_CLIENT_ID is required when AUTH_MODE=jwt")
	}
	if serviceClientSecret == "" {
		return fmt.Errorf("AUTH_SERVICE_CLIENT_SECRET is required when AUTH_MODE=jwt")
	}
	if serviceTokenAudience == "" {
		return fmt.Errorf("AUTH_SERVICE_TOKEN_AUDIENCE is required when AUTH_MODE=jwt")
	}
	return nil
}

func splitCSV(value string) []string {
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	seen := make(map[string]struct{}, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		if _, exists := seen[part]; exists {
			continue
		}
		seen[part] = struct{}{}
		result = append(result, part)
	}
	return result
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
