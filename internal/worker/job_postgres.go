package worker

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const maxJobErrorLength = 1024

var _ JobRepository = (*JobPostgres)(nil)

// JobPostgres is the PostgreSQL-backed worker queue implementation for Gate 4.
// It claims jobs with row-level locking and preserves the lifecycle contract
// defined in docs/README-PROCESS-4.md.
type JobPostgres struct {
	pool     *pgxpool.Pool
	workerID string
	policy   RetryPolicy
	metrics  *Metrics
}

type JobPostgresOption func(*JobPostgres)

func WithJobMetrics(metrics *Metrics) JobPostgresOption {
	return func(repository *JobPostgres) { repository.metrics = metrics }
}

func NewJobPostgres(
	pool *pgxpool.Pool,
	workerID string,
	policy RetryPolicy,
	options ...JobPostgresOption,
) (*JobPostgres, error) {
	if pool == nil {
		return nil, errors.New("job PostgreSQL pool is required")
	}

	trimmedWorkerID := strings.TrimSpace(workerID)
	if trimmedWorkerID == "" {
		return nil, errors.New("worker ID is required")
	}
	if utf8.RuneCountInString(trimmedWorkerID) > 128 {
		return nil, errors.New("worker ID must not exceed 128 characters")
	}

	repository := &JobPostgres{
		pool:     pool,
		workerID: trimmedWorkerID,
		policy:   normalizeRetryPolicy(policy),
	}
	for _, option := range options {
		option(repository)
	}
	return repository, nil
}

func (r *JobPostgres) Claim(ctx context.Context) (Job, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return Job{}, fmt.Errorf("begin claim transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	lockTimeoutMicros := r.policy.LockTimeout.Microseconds()
	deadTag, err := tx.Exec(ctx, `
		UPDATE cloud.jobs
		SET status = 'dead',
		    locked_by = NULL,
		    locked_at = NULL,
		    last_error = COALESCE(
		        last_error,
		        'maximum attempts reached while recovering stale job'
		    )
		WHERE status = 'processing'
		  AND locked_at < NOW() - ($1::bigint * INTERVAL '1 microsecond')
		  AND attempts >= LEAST(max_attempts, $2)
	`, lockTimeoutMicros, r.policy.MaxAttempts)
	if err != nil {
		return Job{}, fmt.Errorf("mark exhausted stale jobs dead: %w", err)
	}

	var (
		job     Job
		jobType string
		payload []byte
		stale   bool
	)
	err = tx.QueryRow(ctx, `
WITH candidate AS (
	SELECT job.id, job.status = 'processing' AS was_stale
	FROM cloud.jobs AS job
	WHERE job.attempts < LEAST(job.max_attempts, $2)
	  AND (
		(job.status IN ('pending', 'failed') AND job.run_after <= NOW())
		OR (
			job.status = 'processing'
			AND job.locked_at < NOW() - ($1::bigint * INTERVAL '1 microsecond')
		)
	  )
	ORDER BY job.priority ASC, job.run_after ASC, job.created_at ASC, job.id ASC
	FOR UPDATE SKIP LOCKED
	LIMIT 1
)
UPDATE cloud.jobs AS job
SET status = 'processing',
	attempts = job.attempts + 1,
	locked_by = $3,
	locked_at = NOW(),
	last_error = NULL
FROM candidate
WHERE job.id = candidate.id
	RETURNING job.id, job.job_type::text, job.payload, candidate.was_stale
	`, lockTimeoutMicros, r.policy.MaxAttempts, r.workerID).Scan(
		&job.ID,
		&jobType,
		&payload,
		&stale,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		if err := tx.Commit(ctx); err != nil {
			return Job{}, fmt.Errorf(
				"commit exhausted stale job recovery: %w",
				err,
			)
		}
		if r.metrics != nil {
			r.metrics.RecordDeadJobs(deadTag.RowsAffected())
		}
		return Job{}, ErrNoJob
	}
	if err != nil {
		return Job{}, fmt.Errorf("claim job: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return Job{}, fmt.Errorf("commit claim transaction: %w", err)
	}
	if r.metrics != nil {
		r.metrics.RecordDeadJobs(deadTag.RowsAffected())
		r.metrics.RecordJobClaimed(stale)
	}

	job.Type = JobType(jobType)
	job.Payload = append([]byte(nil), payload...)
	return job, nil
}

func (r *JobPostgres) Complete(ctx context.Context, jobID string) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin complete transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var (
		status     string
		lockedBy   sql.NullString
		leaseValid bool
	)
	err = tx.QueryRow(ctx, `
		SELECT
			status::text,
			locked_by,
			COALESCE(
				locked_at >= NOW() - ($2::bigint * INTERVAL '1 microsecond'),
				false
			)
		FROM cloud.jobs
		WHERE id = $1
		FOR UPDATE
	`, jobID, r.policy.LockTimeout.Microseconds()).Scan(
		&status,
		&lockedBy,
		&leaseValid,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return errors.New("job not found")
	}
	if err != nil {
		return fmt.Errorf("load job for completion: %w", err)
	}

	switch JobStatus(status) {
	case JobCompleted:
		return tx.Commit(ctx)
	case JobProcessing:
		if !lockedBy.Valid || lockedBy.String != r.workerID || !leaseValid {
			return errors.New("job lease is owned by another worker")
		}
	default:
		return fmt.Errorf("cannot complete job in status %q", status)
	}

	commandTag, err := tx.Exec(ctx, `
		UPDATE cloud.jobs
		SET status = 'completed',
			completed_at = NOW(),
			locked_by = NULL,
			locked_at = NULL,
			last_error = NULL
		WHERE id = $1
		  AND status = 'processing'
		  AND locked_by = $2
		  AND locked_at >= NOW() - ($3::bigint * INTERVAL '1 microsecond')
	`, jobID, r.workerID, r.policy.LockTimeout.Microseconds())
	if err != nil {
		return fmt.Errorf("complete job: %w", err)
	}
	if commandTag.RowsAffected() != 1 {
		return errors.New("job lease is owned by another worker")
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit complete transaction: %w", err)
	}
	if r.metrics != nil {
		r.metrics.RecordJobCompleted()
	}
	return nil
}

func (r *JobPostgres) Fail(ctx context.Context, jobID string, cause error) error {
	if cause == nil {
		return errors.New("job failure cause is required")
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin fail transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var (
		status      string
		lockedBy    sql.NullString
		attempts    int
		maxAttempts int
		leaseValid  bool
	)
	err = tx.QueryRow(ctx, `
		SELECT
			status::text,
			locked_by,
			attempts,
			max_attempts,
			COALESCE(
				locked_at >= NOW() - ($2::bigint * INTERVAL '1 microsecond'),
				false
			)
		FROM cloud.jobs
		WHERE id = $1
		FOR UPDATE
	`, jobID, r.policy.LockTimeout.Microseconds()).Scan(
		&status,
		&lockedBy,
		&attempts,
		&maxAttempts,
		&leaseValid,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return errors.New("job not found")
	}
	if err != nil {
		return fmt.Errorf("load job for failure: %w", err)
	}
	if JobStatus(status) != JobProcessing {
		return fmt.Errorf("cannot fail job in status %q", status)
	}
	if !lockedBy.Valid || lockedBy.String != r.workerID || !leaseValid {
		return errors.New("job lease is owned by another worker")
	}

	effectiveMaxAttempts := min(maxAttempts, r.policy.MaxAttempts)
	nextStatus := string(JobFailed)
	if attempts >= effectiveMaxAttempts {
		nextStatus = string(JobDead)
	}
	retryDelayMicros := r.retryDelay(attempts).Microseconds()

	commandTag, err := tx.Exec(ctx, `
		UPDATE cloud.jobs
		SET status = $3::cloud.job_status,
			run_after = CASE
				WHEN $3::text = 'failed'
				THEN NOW() + ($4::bigint * INTERVAL '1 microsecond')
				ELSE run_after
			END,
			locked_by = NULL,
			locked_at = NULL,
			last_error = $5
		WHERE id = $1
		  AND status = 'processing'
		  AND locked_by = $2
		  AND locked_at >= NOW() - ($6::bigint * INTERVAL '1 microsecond')
	`,
		jobID,
		r.workerID,
		nextStatus,
		retryDelayMicros,
		truncateJobError(cause.Error()),
		r.policy.LockTimeout.Microseconds(),
	)
	if err != nil {
		return fmt.Errorf("fail job: %w", err)
	}
	if commandTag.RowsAffected() != 1 {
		return errors.New("job lease is owned by another worker")
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit fail transaction: %w", err)
	}
	if nextStatus == string(JobDead) && r.metrics != nil {
		r.metrics.RecordDeadJobs(1)
	}
	if r.metrics != nil {
		r.metrics.RecordJobFailed(nextStatus == string(JobFailed))
	}
	return nil
}

func (r *JobPostgres) retryDelay(attempts int) time.Duration {
	if attempts <= 1 {
		return r.policy.BaseBackoff
	}

	delay := r.policy.BaseBackoff
	for attempt := 2; attempt <= attempts; attempt++ {
		if delay >= r.policy.MaxBackoff {
			return r.policy.MaxBackoff
		}
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

func normalizeRetryPolicy(policy RetryPolicy) RetryPolicy {
	defaults := DefaultRetryPolicy()
	if policy.MaxAttempts <= 0 {
		policy.MaxAttempts = defaults.MaxAttempts
	}
	if policy.BaseBackoff <= 0 {
		policy.BaseBackoff = defaults.BaseBackoff
	}
	if policy.MaxBackoff <= 0 {
		policy.MaxBackoff = defaults.MaxBackoff
	}
	if policy.LockTimeout <= 0 {
		policy.LockTimeout = defaults.LockTimeout
	}
	return policy
}

func truncateJobError(message string) string {
	if utf8.RuneCountInString(message) <= maxJobErrorLength {
		return message
	}
	runes := []rune(message)
	return string(runes[:maxJobErrorLength])
}
