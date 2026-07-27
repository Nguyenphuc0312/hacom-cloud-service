package worker

import (
	"context"
	"errors"
	"log/slog"
	"sync"
)

// DemoRepository is an in-memory repository used only to prove the Gate 1
// worker lifecycle. It is replaced by PostgreSQL in a later phase.
type DemoRepository struct {
	mu   sync.Mutex
	jobs []Job
}

func NewDemoRepository(jobs ...Job) *DemoRepository {
	return &DemoRepository{jobs: jobs}
}

func (r *DemoRepository) Claim(ctx context.Context) (Job, error) {
	if err := ctx.Err(); err != nil {
		return Job{}, err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.jobs) == 0 {
		return Job{}, ErrNoJob
	}
	job := r.jobs[0]
	r.jobs = r.jobs[1:]
	return job, nil
}

func (r *DemoRepository) Complete(context.Context, string) error {
	return nil
}

func (r *DemoRepository) Fail(context.Context, string, error) error {
	return nil
}

type DemoHandler struct {
	Logger *slog.Logger
}

func (h DemoHandler) Handle(ctx context.Context, job Job) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if h.Logger == nil {
		return errors.New("demo handler logger is required")
	}
	h.Logger.Info("demo handler executed", "job_id", job.ID)
	return nil
}
