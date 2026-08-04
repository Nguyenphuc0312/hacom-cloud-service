package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

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
	)
	if err := runner.Run(ctx); err != nil {
		logger.Error("run worker", "error", err)
		os.Exit(1)
	}
	logger.Info("cloud worker stopped")
}
