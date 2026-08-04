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

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/config"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		slog.Error("load configuration", "error", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	logger := slog.Default().With("component", "cloud-worker", "environment", cfg.AppEnv)
	runner, closeDependencies, err := newProductionLifecycleWorker(
		ctx,
		cfg,
		logger,
	)
	if err != nil {
		logger.Error("bootstrap worker", "error", err)
		os.Exit(1)
	}
	defer closeDependencies()

	logger.Info(
		"cloud worker started",
		"worker_id", cfg.WorkerID,
		"poll_interval", cfg.WorkerPollInterval,
		"job_timeout", cfg.WorkerJobTimeout,
		"lock_timeout", cfg.WorkerLockTimeout,
		"trash_retention", cfg.TrashRetention,
		"trash_scan_interval", cfg.WorkerTrashScanInterval,
		"trash_batch_size", cfg.WorkerTrashBatchSize,
		"metrics_address", cfg.WorkerMetricsAddr,
	)

	metricsServer := &http.Server{
		Addr:              cfg.WorkerMetricsAddr,
		Handler:           runner.MetricsHandler(),
		ReadHeaderTimeout: 5 * time.Second,
	}
	metricsErrors := make(chan error, 1)
	if cfg.WorkerMetricsAddr != "" {
		go func() { metricsErrors <- metricsServer.ListenAndServe() }()
	} else {
		metricsErrors = nil
	}
	workerErrors := make(chan error, 1)
	go func() { workerErrors <- runner.Run(ctx) }()

	var runErr error
	select {
	case runErr = <-workerErrors:
	case metricsErr := <-metricsErrors:
		if !errors.Is(metricsErr, http.ErrServerClosed) {
			runErr = metricsErr
			logger.Error("worker metrics server stopped", "error", metricsErr)
			stop()
			<-workerErrors
		}
	case <-ctx.Done():
		runErr = <-workerErrors
	}
	shutdownCtx, cancelShutdown := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancelShutdown()
	if cfg.WorkerMetricsAddr != "" {
		if err := metricsServer.Shutdown(shutdownCtx); err != nil {
			logger.Error("shutdown worker metrics server", "error", err)
		}
	}
	if runErr != nil {
		logger.Error("run worker", "error", runErr)
		os.Exit(1)
	}
	logger.Info("cloud worker stopped")
}
