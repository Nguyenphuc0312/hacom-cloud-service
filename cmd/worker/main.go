package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/config"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/worker"
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
	repository := worker.NewDemoRepository(worker.Job{
		ID:   "gate-1-demo",
		Type: worker.JobDemo,
	})
	runner, err := worker.New(repository, worker.WithLogger(logger))
	if err != nil {
		logger.Error("create worker", "error", err)
		os.Exit(1)
	}
	if err := runner.Register(worker.JobDemo, worker.DemoHandler{Logger: logger}); err != nil {
		logger.Error("register demo handler", "error", err)
		os.Exit(1)
	}

	logger.Info("cloud worker started")
	if err := runner.Run(ctx); err != nil {
		logger.Error("run worker", "error", err)
		os.Exit(1)
	}
	logger.Info("cloud worker stopped")
}
