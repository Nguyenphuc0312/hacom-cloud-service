package worker

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"
)

const defaultPollInterval = 2 * time.Second

type Worker struct {
	repository   JobRepository
	handlers     map[JobType]JobHandler
	pollInterval time.Duration
	logger       *slog.Logger
}

type Option func(*Worker)

func WithPollInterval(interval time.Duration) Option {
	return func(worker *Worker) {
		if interval > 0 {
			worker.pollInterval = interval
		}
	}
}

func WithLogger(logger *slog.Logger) Option {
	return func(worker *Worker) {
		if logger != nil {
			worker.logger = logger
		}
	}
}

func New(repository JobRepository, options ...Option) (*Worker, error) {
	if repository == nil {
		return nil, errors.New("job repository is required")
	}

	instance := &Worker{
		repository:   repository,
		handlers:     make(map[JobType]JobHandler),
		pollInterval: defaultPollInterval,
		logger:       slog.Default(),
	}
	for _, option := range options {
		option(instance)
	}
	return instance, nil
}

func (w *Worker) Register(jobType JobType, handler JobHandler) error {
	if jobType == "" {
		return errors.New("job type is required")
	}
	if handler == nil {
		return errors.New("job handler is required")
	}
	if _, exists := w.handlers[jobType]; exists {
		return fmt.Errorf("handler for job type %q is already registered", jobType)
	}
	w.handlers[jobType] = handler
	return nil
}

func (w *Worker) Run(ctx context.Context) error {
	w.logger.Info("worker polling loop started", "poll_interval", w.pollInterval)
	defer w.logger.Info("worker polling loop stopped")

	timer := time.NewTimer(0)
	defer timer.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-timer.C:
			w.processNext(ctx)
			timer.Reset(w.pollInterval)
		}
	}
}

func (w *Worker) processNext(ctx context.Context) {
	job, err := w.repository.Claim(ctx)
	if errors.Is(err, ErrNoJob) {
		w.logger.Debug("no job available")
		return
	}
	if err != nil {
		w.logger.Error("claim job", "error", err)
		return
	}

	logger := w.logger.With("job_id", job.ID, "job_type", job.Type)
	handler, exists := w.handlers[job.Type]
	if !exists {
		cause := fmt.Errorf("no handler registered for job type %q", job.Type)
		logger.Error("handle job", "error", cause)
		if err := w.repository.Fail(ctx, job.ID, cause); err != nil {
			logger.Error("mark job failed", "error", err)
		}
		return
	}

	logger.Info("job started")
	if err := handler.Handle(ctx, job); err != nil {
		logger.Error("job handler failed", "error", err)
		if failErr := w.repository.Fail(ctx, job.ID, err); failErr != nil {
			logger.Error("mark job failed", "error", failErr)
		}
		return
	}
	if err := w.repository.Complete(ctx, job.ID); err != nil {
		logger.Error("mark job complete", "error", err)
		return
	}
	logger.Info("job completed")
}
