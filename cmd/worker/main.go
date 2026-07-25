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

	slog.Info("cloud worker started", "environment", cfg.AppEnv)
	<-ctx.Done()
	slog.Info("cloud worker stopped")
}
