package handlers

import (
	"errors"
	"fmt"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/worker"
)

func RegisterLifecycleHandlers(
	runner *worker.Worker,
	hashHandler *HashFileHandler,
	cleanupHandler *CleanupExpiredUploadHandler,
) error {
	if runner == nil {
		return errors.New("worker is required")
	}
	if hashHandler == nil {
		return errors.New("HASH_FILE handler is required")
	}
	if cleanupHandler == nil {
		return errors.New("cleanup handler is required")
	}
	if err := runner.Register(worker.JobHashFile, hashHandler); err != nil {
		return fmt.Errorf("register HASH_FILE handler: %w", err)
	}
	if err := runner.Register(worker.JobCleanupExpired, cleanupHandler); err != nil {
		return fmt.Errorf("register cleanup handler: %w", err)
	}
	return nil
}
