package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

const defaultMaxUploadBytes int64 = 100 * 1024 * 1024

type Config struct {
	AppEnv          string
	APIAddr         string
	DatabaseURL     string
	MinIOEndpoint   string
	MinIOAccessKey  string
	MinIOSecretKey  string
	MinIOUseSSL     bool
	MinIOBucket     string
	MaxUploadBytes  int64
	HealthTimeout   time.Duration
	ShutdownTimeout time.Duration
}

func Load() (Config, error) {
	maxUploadBytes, err := int64Env("MAX_UPLOAD_BYTES", defaultMaxUploadBytes)
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

	shutdownTimeout, err := durationEnv("SHUTDOWN_TIMEOUT", 10*time.Second)
	if err != nil {
		return Config{}, err
	}

	cfg := Config{
		AppEnv:          env("APP_ENV", "local"),
		APIAddr:         env("API_ADDR", ":8080"),
		DatabaseURL:     os.Getenv("DATABASE_URL"),
		MinIOEndpoint:   os.Getenv("MINIO_ENDPOINT"),
		MinIOAccessKey:  os.Getenv("MINIO_ACCESS_KEY"),
		MinIOSecretKey:  os.Getenv("MINIO_SECRET_KEY"),
		MinIOUseSSL:     useSSL,
		MinIOBucket:     env("MINIO_BUCKET", "hacom-cloud-private"),
		MaxUploadBytes:  maxUploadBytes,
		HealthTimeout:   healthTimeout,
		ShutdownTimeout: shutdownTimeout,
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
