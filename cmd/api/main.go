package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/auth"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/cloud"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/cloudapi"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/config"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/health"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/repository"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/router"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/storage"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/upload"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	redis "github.com/redis/go-redis/v9"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	cfg, err := config.Load()
	if err != nil {
		logger.Error("load configuration", "error", err)
		os.Exit(1)
	}

	poolConfig, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		logger.Error("parse PostgreSQL configuration", "error", err)
		os.Exit(1)
	}
	poolConfig.MaxConnLifetime = 30 * time.Minute
	poolConfig.MinConns = 1
	poolConfig.MaxConns = 10
	db, err := pgxpool.NewWithConfig(context.Background(), poolConfig)
	if err != nil {
		logger.Error("create PostgreSQL pool", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	minioClient, err := minio.New(cfg.MinIOEndpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.MinIOAccessKey, cfg.MinIOSecretKey, ""),
		Secure: cfg.MinIOUseSSL,
	})
	if err != nil {
		logger.Error("create MinIO client", "error", err)
		os.Exit(1)
	}

	healthService := health.NewService(
		cfg.HealthTimeout,
		health.NewPostgresChecker(db),
		health.NewMinIOChecker(minioClient, cfg.MinIOBucket),
	)

	objectStore, err := storage.NewMinIOStore(minioClient, cfg.MinIOBucket)
	if err != nil {
		logger.Error("create MinIO object store", "error", err)
		os.Exit(1)
	}

	cloudStore, err := repository.NewCloudPostgres(
		db,
		cfg.DefaultQuotaBytes,
		repository.WithStorageBucket(cfg.MinIOBucket),
	)
	if err != nil {
		logger.Error("create cloud repository", "error", err)
		os.Exit(1)
	}
	cloudService, err := cloud.NewService(cloudStore, cfg.MaxContentBytes)
	if err != nil {
		logger.Error("create cloud service", "error", err)
		os.Exit(1)
	}
	uploadService, err := upload.NewService(
		cloudStore,
		objectStore,
		cfg.MaxUploadBytes,
		cfg.UploadURLTTL,
	)
	if err != nil {
		logger.Error("create upload service", "error", err)
		os.Exit(1)
	}
	rateLimiter, err := auth.NewRateLimiter(cfg.AuthRateLimit, cfg.AuthRateWindow)
	if err != nil {
		logger.Error("create auth rate limiter", "error", err)
		os.Exit(1)
	}
	var authMiddleware func(http.Handler) http.Handler
	if cfg.AuthMode == "jwt" {
		var revocationChecker auth.RevocationChecker
		if cfg.AuthRedisAddr != "" {
			revocationChecker = auth.RedisRevocationChecker{Client: redis.NewClient(&redis.Options{
				Addr: cfg.AuthRedisAddr, Password: cfg.AuthRedisPassword, DB: cfg.AuthRedisDB,
			})}
		} else {
			revocationChecker = auth.HTTPRevocationChecker{URL: cfg.AuthRevocationURL}
		}
		verifier, verifyErr := auth.NewVerifier(auth.Config{
			JWKSURL:                  cfg.AuthJWKSURL,
			Issuer:                   cfg.AuthIssuer,
			Audience:                 cfg.AuthAudience,
			JWKSCacheTTL:             cfg.AuthJWKSCacheTTL,
			LegacyHS256VerifyEnabled: cfg.AuthLegacyHS256Enabled,
			LegacyHS256Secret:        []byte(cfg.AuthLegacyHS256Secret),
			RevocationChecker:        revocationChecker,
		})
		if verifyErr != nil {
			logger.Error("create auth verifier", "error", verifyErr)
			os.Exit(1)
		}
		authMiddleware = func(next http.Handler) http.Handler {
			handler, middlewareErr := auth.Middleware(auth.MiddlewareConfig{Mode: auth.ModeJWT, AppEnv: cfg.AppEnv, Verifier: verifier, RateLimiter: rateLimiter}, next)
			if middlewareErr != nil {
				panic(middlewareErr)
			}
			return handler
		}
	} else {
		authMiddleware = func(next http.Handler) http.Handler {
			handler, middlewareErr := auth.Middleware(auth.MiddlewareConfig{Mode: auth.ModeDemo, AppEnv: cfg.AppEnv, RateLimiter: rateLimiter}, next)
			if middlewareErr != nil {
				panic(middlewareErr)
			}
			return handler
		}
	}
	cloudHandler, err := cloudapi.New(
		cloudService,
		cfg.MaxContentBytes,
		logger,
		cloudapi.WithUploadService(uploadService),
		cloudapi.WithAuthMiddleware(authMiddleware),
	)
	if err != nil {
		logger.Error("create cloud API handler", "error", err)
		os.Exit(1)
	}

	server := &http.Server{
		Addr:              cfg.APIAddr,
		Handler:           router.New(healthService, cloudHandler),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	serverErr := make(chan error, 1)
	go func() {
		logger.Info("API listening", "address", cfg.APIAddr, "environment", cfg.AppEnv)
		serverErr <- server.ListenAndServe()
	}()

	signalCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	select {
	case <-signalCtx.Done():
		logger.Info("shutdown signal received")
	case err := <-serverErr:
		if !errors.Is(err, http.ErrServerClosed) {
			logger.Error("API stopped unexpectedly", "error", err)
			os.Exit(1)
		}
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("graceful shutdown failed", "error", err)
		os.Exit(1)
	}
}
