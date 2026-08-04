package worker

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"
)

const (
	defaultPollInterval = 2 * time.Second
	defaultJobTimeout   = 5 * time.Minute
)

type Worker struct {
	repository          JobRepository
	handlers            map[JobType]JobHandler
	pollInterval        time.Duration
	jobTimeout          time.Duration
	cleanupScanner      CleanupScanner
	cleanupScanInterval time.Duration
	cleanupBatchSize    int
	trashScanner        TrashScanner
	trashScanInterval   time.Duration
	trashBatchSize      int
	metrics             *Metrics
	logger              *slog.Logger
}

type Option func(*Worker)

type CleanupScanner interface {
	EnqueueExpiredUploadJobs(ctx context.Context, limit int) (int, error)
}

type TrashScanner interface {
	EnqueueExpiredTrashJobs(ctx context.Context, limit int) (int, error)
}

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

func WithMetrics(metrics *Metrics) Option {
	return func(worker *Worker) {
		worker.metrics = metrics
	}
}

func WithJobTimeout(timeout time.Duration) Option {
	return func(worker *Worker) {
		if timeout > 0 {
			worker.jobTimeout = timeout
		}
	}
}

func WithCleanupScanner(scanner CleanupScanner, interval time.Duration, batchSize int) Option {
	return func(worker *Worker) {
		worker.cleanupScanner = scanner
		worker.cleanupScanInterval = interval
		worker.cleanupBatchSize = batchSize
	}
}

func WithTrashScanner(scanner TrashScanner, interval time.Duration, batchSize int) Option {
	return func(worker *Worker) {
		worker.trashScanner = scanner
		worker.trashScanInterval = interval
		worker.trashBatchSize = batchSize
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
		jobTimeout:   defaultJobTimeout,
		logger:       slog.Default(),
	}
	for _, option := range options {
		option(instance)
	}
	if instance.cleanupScanner != nil {
		if instance.cleanupScanInterval <= 0 {
			return nil, errors.New("cleanup scan interval must be positive")
		}
		if instance.cleanupBatchSize <= 0 {
			return nil, errors.New("cleanup batch size must be positive")
		}
	}
	if instance.trashScanner != nil {
		if instance.trashScanInterval <= 0 {
			return nil, errors.New("Trash scan interval must be positive")
		}
		if instance.trashBatchSize <= 0 {
			return nil, errors.New("Trash scan batch size must be positive")
		}
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
	var cleanupTimer *time.Timer
	var cleanupC <-chan time.Time
	if w.cleanupScanner != nil {
		cleanupTimer = time.NewTimer(0)
		cleanupC = cleanupTimer.C
		defer cleanupTimer.Stop()
	}
	var trashTimer *time.Timer
	var trashC <-chan time.Time
	if w.trashScanner != nil {
		trashTimer = time.NewTimer(0)
		trashC = trashTimer.C
		defer trashTimer.Stop()
	}

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-timer.C:
			w.processNext(ctx)
			timer.Reset(w.pollInterval)
		case <-cleanupC:
			w.scanExpiredUploads(ctx)
			cleanupTimer.Reset(w.cleanupScanInterval)
		case <-trashC:
			w.scanExpiredTrash(ctx)
			trashTimer.Reset(w.trashScanInterval)
		}
	}
}

func (w *Worker) MetricsHandler() http.Handler {
	if w.metrics == nil {
		return NewMetrics().Handler()
	}
	return w.metrics.Handler()
}

func (w *Worker) scanExpiredTrash(ctx context.Context) {
	purged, err := w.trashScanner.EnqueueExpiredTrashJobs(ctx, w.trashBatchSize)
	if err != nil {
		if w.metrics != nil {
			w.metrics.RecordPurgeFailed()
		}
		if ctx.Err() == nil {
			w.logger.Error("scan expired Trash", "error", err)
		}
		return
	}
	if w.metrics != nil {
		w.metrics.RecordPurgeScanned(purged)
	}
	if purged > 0 {
		w.logger.Info("expired Trash items purged and delete jobs enqueued", "count", purged)
	}
}

func (w *Worker) scanExpiredUploads(ctx context.Context) {
	enqueued, err := w.cleanupScanner.EnqueueExpiredUploadJobs(ctx, w.cleanupBatchSize)
	if err != nil {
		if ctx.Err() == nil {
			w.logger.Error("scan expired uploads", "error", err)
		}
		return
	}
	if enqueued > 0 {
		w.logger.Info("expired upload cleanup jobs enqueued", "count", enqueued)
	}
}

func (w *Worker) processNext(ctx context.Context) {
	job, err := w.repository.Claim(ctx)
	if errors.Is(err, ErrNoJob) {
		w.logger.Debug("no job available")
		return
	}
	if err != nil {
		if ctx.Err() != nil {
			return
		}
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

	logger.Info("job started", "timeout", w.jobTimeout)
	jobCtx, cancel := context.WithTimeout(ctx, w.jobTimeout)
	handleErr := handler.Handle(jobCtx, job)
	jobContextErr := jobCtx.Err()
	cancel()

	if handleErr == nil && jobContextErr != nil {
		handleErr = jobContextErr
	}
	if handleErr != nil {
		if job.Type == JobPermanentDelete && w.metrics != nil {
			w.metrics.RecordPurgeFailed()
		}
		logger.Error("job handler failed", "error", handleErr)
		if ctx.Err() != nil {
			logger.Info("worker is shutting down; leaving job lease for stale recovery")
			return
		}
		if failErr := w.repository.Fail(ctx, job.ID, handleErr); failErr != nil {
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
