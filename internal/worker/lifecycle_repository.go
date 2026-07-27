package worker

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"
)

type JobStatus string

const (
	JobPending    JobStatus = "PENDING"
	JobProcessing JobStatus = "PROCESSING"
	JobCompleted  JobStatus = "COMPLETED"
	JobFailed     JobStatus = "FAILED"
)

type RetryPolicy struct {
	MaxAttempts int
	BaseBackoff time.Duration
	MaxBackoff  time.Duration
	LockTimeout time.Duration
}

func DefaultRetryPolicy() RetryPolicy {
	return RetryPolicy{
		MaxAttempts: 5,
		BaseBackoff: time.Second,
		MaxBackoff:  time.Minute,
		LockTimeout: 5 * time.Minute,
	}
}

type JobRecord struct {
	Job         Job
	Status      JobStatus
	Attempts    int
	AvailableAt time.Time
	LockedAt    time.Time
	LastError   string
}

// LifecycleRepository is an in-memory reference implementation for retry,
// backoff, max-attempt and stale-lock behavior. The PostgreSQL repository must
// preserve the same state transitions using row locks and SKIP LOCKED.
type LifecycleRepository struct {
	mu      sync.Mutex
	records map[string]JobRecord
	policy  RetryPolicy
	now     func() time.Time
}

func NewLifecycleRepository(policy RetryPolicy, now func() time.Time) (*LifecycleRepository, error) {
	if policy.MaxAttempts <= 0 {
		return nil, errors.New("max attempts must be positive")
	}
	if policy.BaseBackoff <= 0 || policy.MaxBackoff < policy.BaseBackoff {
		return nil, errors.New("retry backoff configuration is invalid")
	}
	if policy.LockTimeout <= 0 {
		return nil, errors.New("lock timeout must be positive")
	}
	if now == nil {
		now = time.Now
	}
	return &LifecycleRepository{
		records: make(map[string]JobRecord),
		policy:  policy,
		now:     now,
	}, nil
}

func (r *LifecycleRepository) Enqueue(job Job) error {
	if job.ID == "" {
		return errors.New("job ID is required")
	}
	if job.Type == "" {
		return errors.New("job type is required")
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, exists := r.records[job.ID]; exists {
		return fmt.Errorf("job %q already exists", job.ID)
	}
	r.records[job.ID] = JobRecord{
		Job:         job,
		Status:      JobPending,
		AvailableAt: r.now(),
	}
	return nil
}

func (r *LifecycleRepository) Claim(ctx context.Context) (Job, error) {
	if err := ctx.Err(); err != nil {
		return Job{}, err
	}
	r.mu.Lock()
	defer r.mu.Unlock()

	now := r.now()
	for id, record := range r.records {
		claimable := record.Status == JobPending && !record.AvailableAt.After(now)
		stale := record.Status == JobProcessing &&
			!record.LockedAt.IsZero() &&
			!record.LockedAt.Add(r.policy.LockTimeout).After(now)
		if !claimable && !stale {
			continue
		}
		if record.Attempts >= r.policy.MaxAttempts {
			record.Status = JobFailed
			record.LockedAt = time.Time{}
			if record.LastError == "" {
				record.LastError = "maximum attempts reached while recovering stale job"
			}
			r.records[id] = record
			continue
		}

		record.Status = JobProcessing
		record.Attempts++
		record.LockedAt = now
		r.records[id] = record
		return record.Job, nil
	}
	return Job{}, ErrNoJob
}

func (r *LifecycleRepository) Complete(ctx context.Context, jobID string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	record, exists := r.records[jobID]
	if !exists {
		return errors.New("job not found")
	}
	if record.Status == JobCompleted {
		return nil
	}
	if record.Status != JobProcessing {
		return fmt.Errorf("cannot complete job in status %q", record.Status)
	}
	record.Status = JobCompleted
	record.LockedAt = time.Time{}
	record.LastError = ""
	r.records[jobID] = record
	return nil
}

func (r *LifecycleRepository) Fail(ctx context.Context, jobID string, cause error) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if cause == nil {
		return errors.New("job failure cause is required")
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	record, exists := r.records[jobID]
	if !exists {
		return errors.New("job not found")
	}
	if record.Status != JobProcessing {
		return fmt.Errorf("cannot fail job in status %q", record.Status)
	}

	record.LastError = cause.Error()
	record.LockedAt = time.Time{}
	if record.Attempts >= r.policy.MaxAttempts {
		record.Status = JobFailed
	} else {
		record.Status = JobPending
		record.AvailableAt = r.now().Add(r.retryDelay(record.Attempts))
	}
	r.records[jobID] = record
	return nil
}

func (r *LifecycleRepository) Get(jobID string) (JobRecord, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	record, exists := r.records[jobID]
	return record, exists
}

func (r *LifecycleRepository) retryDelay(attempt int) time.Duration {
	delay := r.policy.BaseBackoff
	for index := 1; index < attempt && delay < r.policy.MaxBackoff; index++ {
		if delay > r.policy.MaxBackoff/2 {
			return r.policy.MaxBackoff
		}
		delay *= 2
	}
	if delay > r.policy.MaxBackoff {
		return r.policy.MaxBackoff
	}
	return delay
}
