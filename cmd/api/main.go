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

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/cloud"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/cloudapi"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/config"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/fileaccess"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/health"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/quotarequest"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/repository"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/router"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/storage"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/trash"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/upload"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	cfg, err := config.Load()
	if err != nil {
		logger.Error("load configuration", "error", err)
		os.Exit(1)
	}
	authenticator, authCloser, err := buildAuthenticator(cfg)
	if err != nil {
		logger.Error("initialize Cloud authentication", "error", err, "auth_mode", cfg.AuthMode)
		os.Exit(1)
	}
	if authCloser != nil {
		defer authCloser.Close()
	}
	adminServiceAuthenticator, err := buildAdminServiceAuthenticator(cfg)
	if err != nil {
		logger.Error("initialize Cloud admin service authentication", "error", err)
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
		repository.WithSearchQueryTimeout(cfg.SearchQueryTimeout),
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
	fileAccessService, err := fileaccess.NewService(
		cloudStore,
		objectStore,
		cfg.DownloadURLTTL,
	)
	if err != nil {
		logger.Error("create file access service", "error", err)
		os.Exit(1)
	}
	trashStore, err := repository.NewTrashPostgres(
		db,
		repository.WithTrashSearchQueryTimeout(cfg.SearchQueryTimeout),
	)
	if err != nil {
		logger.Error("create Trash repository", "error", err)
		os.Exit(1)
	}
	trashService, err := trash.NewService(trashStore, nil)
	if err != nil {
		logger.Error("create Trash service", "error", err)
		os.Exit(1)
	}
	quotaRequestStore, err := repository.NewQuotaRequestPostgres(db, cfg.DefaultQuotaBytes)
	if err != nil {
		logger.Error("create quota-request repository", "error", err)
		os.Exit(1)
	}
	quotaRequestService, err := quotarequest.NewService(
		quotaRequestStore,
		cfg.QuotaRequestTiersBytes,
	)
	if err != nil {
		logger.Error("create quota-request service", "error", err)
		os.Exit(1)
	}
	cloudHandler, err := cloudapi.New(
		cloudService,
		cfg.MaxContentBytes,
		logger,
		cloudapi.WithUploadService(uploadService),
		cloudapi.WithFileAccessService(fileAccessService),
		cloudapi.WithTrashService(trashService),
		cloudapi.WithQuotaRequestService(quotaRequestService),
		cloudapi.WithAuthenticator(authenticator),
	)
	if err != nil {
		logger.Error("create cloud API handler", "error", err)
		os.Exit(1)
	}
	adminQuotaHandler, err := cloudapi.NewAdminQuotaHandler(quotaRequestService, adminServiceAuthenticator, logger)
	if err != nil {
		logger.Error("create Cloud admin quota handler", "error", err)
		os.Exit(1)
	}

	server := &http.Server{
		Addr:              cfg.APIAddr,
		Handler:           router.New(healthService, cloudHandler, adminQuotaHandler),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	serverErr := make(chan error, 1)
	go func() {
		logger.Info(
			"API listening",
			"address", cfg.APIAddr,
			"environment", cfg.AppEnv,
			"auth_mode", cfg.AuthMode,
		)
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
