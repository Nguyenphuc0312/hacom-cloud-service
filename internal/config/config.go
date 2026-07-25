package config

import (
	"fmt"
	"os"
	"strconv"
)

const defaultMaxUploadBytes int64 = 100 * 1024 * 1024

type Config struct {
	AppEnv            string
	APIAddr           string
	DatabaseURL       string
	MinIOEndpoint     string
	MinIOAccessKey    string
	MinIOSecretKey    string
	MinIOUseSSL       bool
	MinIOBucket       string
	MaxUploadBytes    int64
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

	return Config{
		AppEnv:         env("APP_ENV", "local"),
		APIAddr:        env("API_ADDR", ":8080"),
		DatabaseURL:    os.Getenv("DATABASE_URL"),
		MinIOEndpoint:  os.Getenv("MINIO_ENDPOINT"),
		MinIOAccessKey: os.Getenv("MINIO_ACCESS_KEY"),
		MinIOSecretKey: os.Getenv("MINIO_SECRET_KEY"),
		MinIOUseSSL:    useSSL,
		MinIOBucket:    env("MINIO_BUCKET", "hacom-cloud-private"),
		MaxUploadBytes: maxUploadBytes,
	}, nil
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
