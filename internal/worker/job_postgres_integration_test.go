package worker

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func integrationWorkerPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not configured")
	}
	pool, err := pgxpool.New(context.Background(), databaseURL)
	if err != nil {
		t.Fatalf("create PostgreSQL pool: %v", err)
	}
	if err := pool.Ping(context.Background()); err != nil {
		pool.Close()
		t.Fatalf("ping PostgreSQL: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func cleanupWorkerDrive(t *testing.T, pool *pgxpool.Pool, driveID uuid.UUID) {
	t.Helper()
	t.Cleanup(func() {
		ctx := context.Background()
		queries := []string{
			`DELETE FROM cloud.jobs WHERE drive_id = $1`,
			`DELETE FROM cloud.drives WHERE id = $1`,
		}
		for _, query := range queries {
			if _, err := pool.Exec(ctx, query, driveID); err != nil {
				t.Errorf("cleanup drive %s: %v", driveID, err)
				return
			}
		}
	})
}

func insertWorkerDrive(t *testing.T, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	driveID := uuid.New()
	ownerID := uuid.New()
	if _, err := pool.Exec(context.Background(), `
		INSERT INTO cloud.drives (id, owner_user_id, name)
		VALUES ($1, $2, $3)
	`, driveID, ownerID, "Worker Test Drive"); err != nil {
		t.Fatalf("insert drive: %v", err)
	}
	cleanupWorkerDrive(t, pool, driveID)
	return driveID
}

func insertWorkerJob(
	t *testing.T,
	pool *pgxpool.Pool,
	driveID uuid.UUID,
	jobID uuid.UUID,
	jobType JobType,
	status JobStatus,
	priority int16,
	attempts int,
	maxAttempts int,
	runAfter time.Time,
	lockedBy *string,
	lockedAt *time.Time,
	payload any,
) {
	t.Helper()
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	var lockedByValue any
	var lockedAtValue any
	if lockedBy != nil {
		lockedByValue = *lockedBy
	}
	if lockedAt != nil {
		lockedAtValue = *lockedAt
	}
	if _, err := pool.Exec(context.Background(), `
		INSERT INTO cloud.jobs (
			id, job_type, status, drive_id, payload, priority,
			attempts, max_attempts, run_after, locked_by, locked_at
		)
		VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11)
	`, jobID, jobType, status, driveID, string(payloadBytes), priority, attempts, maxAttempts, runAfter, lockedByValue, lockedAtValue); err != nil {
		t.Fatalf("insert job: %v", err)
	}
}

func TestJobPostgresClaimsByPriorityAndReturnsPayload(t *testing.T) {
	pool := integrationWorkerPool(t)
	driveID := insertWorkerDrive(t, pool)
	worker, err := NewJobPostgres(pool, "worker-a", RetryPolicy{})
	if err != nil {
		t.Fatal(err)
	}

	lowPriorityID := uuid.New()
	highPriorityID := uuid.New()
	insertWorkerJob(
		t,
		pool,
		driveID,
		lowPriorityID,
		JobHashFile,
		JobPending,
		50,
		0,
		3,
		time.Now().UTC(),
		nil,
		nil,
		map[string]string{"name": "low"},
	)
	insertWorkerJob(
		t,
		pool,
		driveID,
		highPriorityID,
		JobHashFile,
		JobPending,
		10,
		0,
		3,
		time.Now().UTC(),
		nil,
		nil,
		map[string]string{"name": "high"},
	)

	job, err := worker.Claim(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if job.ID != highPriorityID.String() {
		t.Fatalf("claimed job = %s, want %s", job.ID, highPriorityID)
	}
	if job.Type != JobHashFile {
		t.Fatalf("job type = %s, want %s", job.Type, JobHashFile)
	}
	if string(job.Payload) != `{"name":"high"}` {
		t.Fatalf("job payload = %s", job.Payload)
	}

	var status string
	var attempts int
	var lockedBy string
	if err := pool.QueryRow(context.Background(), `
		SELECT status::text, attempts, locked_by
		FROM cloud.jobs
		WHERE id = $1
	`, highPriorityID).Scan(&status, &attempts, &lockedBy); err != nil {
		t.Fatal(err)
	}
	if status != string(JobProcessing) || attempts != 1 || lockedBy != "worker-a" {
		t.Fatalf("claimed row = status:%s attempts:%d locked_by:%s", status, attempts, lockedBy)
	}
}

func TestJobPostgresConcurrentClaimAllowsOnlyOneWinner(t *testing.T) {
	pool := integrationWorkerPool(t)
	driveID := insertWorkerDrive(t, pool)
	jobID := uuid.New()
	insertWorkerJob(
		t,
		pool,
		driveID,
		jobID,
		JobHashFile,
		JobPending,
		10,
		0,
		3,
		time.Now().UTC(),
		nil,
		nil,
		map[string]string{"name": "race"},
	)

	workerA, err := NewJobPostgres(pool, "worker-a", RetryPolicy{})
	if err != nil {
		t.Fatal(err)
	}
	workerB, err := NewJobPostgres(pool, "worker-b", RetryPolicy{})
	if err != nil {
		t.Fatal(err)
	}

	start := make(chan struct{})
	results := make(chan error, 2)
	claimed := make(chan string, 2)
	var waitGroup sync.WaitGroup
	for _, repo := range []JobRepository{workerA, workerB} {
		waitGroup.Add(1)
		go func(repository JobRepository) {
			defer waitGroup.Done()
			<-start
			job, claimErr := repository.Claim(context.Background())
			if claimErr == nil {
				claimed <- job.ID
			}
			results <- claimErr
		}(repo)
	}
	close(start)
	waitGroup.Wait()
	close(results)
	close(claimed)

	successes := 0
	for claimErr := range results {
		switch {
		case claimErr == nil:
			successes++
		case errors.Is(claimErr, ErrNoJob):
		default:
			t.Fatalf("claim error = %v", claimErr)
		}
	}
	if successes != 1 {
		t.Fatalf("successful claims = %d, want 1", successes)
	}

	for claimedID := range claimed {
		if claimedID != jobID.String() {
			t.Fatalf("claimed job = %s, want %s", claimedID, jobID)
		}
	}
}

func TestJobPostgresFailRetriesThenMovesToDead(t *testing.T) {
	pool := integrationWorkerPool(t)
	driveID := insertWorkerDrive(t, pool)
	jobID := uuid.New()
	insertWorkerJob(
		t,
		pool,
		driveID,
		jobID,
		JobHashFile,
		JobPending,
		10,
		0,
		2,
		time.Now().UTC(),
		nil,
		nil,
		map[string]string{"name": "retry"},
	)

	worker, err := NewJobPostgres(pool, "worker-a", RetryPolicy{
		MaxAttempts: 2,
		BaseBackoff: 2 * time.Second,
		MaxBackoff:  8 * time.Second,
		LockTimeout: 30 * time.Second,
	})
	if err != nil {
		t.Fatal(err)
	}

	firstClaim, err := worker.Claim(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	longMessage := strings.Repeat("x", maxJobErrorLength+32)
	if err := worker.Fail(context.Background(), firstClaim.ID, errors.New(longMessage)); err != nil {
		t.Fatal(err)
	}

	var status string
	var attempts int
	var lastError string
	var runAfter time.Time
	if err := pool.QueryRow(context.Background(), `
		SELECT status::text, attempts, last_error, run_after
		FROM cloud.jobs
		WHERE id = $1
	`, jobID).Scan(&status, &attempts, &lastError, &runAfter); err != nil {
		t.Fatal(err)
	}
	if status != string(JobFailed) || attempts != 1 {
		t.Fatalf("failed retry row = status:%s attempts:%d", status, attempts)
	}
	if len(lastError) != maxJobErrorLength {
		t.Fatalf("last_error length = %d, want %d", len(lastError), maxJobErrorLength)
	}
	if time.Until(runAfter) < 1500*time.Millisecond {
		t.Fatalf("run_after = %v, want at least ~2s in the future", runAfter)
	}

	if _, err := pool.Exec(context.Background(), `
		UPDATE cloud.jobs
		SET run_after = NOW() - INTERVAL '1 second'
		WHERE id = $1
	`, jobID); err != nil {
		t.Fatal(err)
	}

	secondClaim, err := worker.Claim(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if secondClaim.ID != jobID.String() {
		t.Fatalf("reclaimed job = %s, want %s", secondClaim.ID, jobID)
	}
	if err := worker.Fail(context.Background(), secondClaim.ID, errors.New("permanent failure")); err != nil {
		t.Fatal(err)
	}

	if err := pool.QueryRow(context.Background(), `
		SELECT status::text, attempts, last_error
		FROM cloud.jobs
		WHERE id = $1
	`, jobID).Scan(&status, &attempts, &lastError); err != nil {
		t.Fatal(err)
	}
	if status != string(JobDead) || attempts != 2 || lastError != "permanent failure" {
		t.Fatalf("dead row = status:%s attempts:%d last_error:%q", status, attempts, lastError)
	}
	if _, err := worker.Claim(context.Background()); !errors.Is(err, ErrNoJob) {
		t.Fatalf("claim dead job error = %v, want ErrNoJob", err)
	}
}

func TestJobPostgresRecoversStaleLockAndCompleteIsIdempotent(t *testing.T) {
	pool := integrationWorkerPool(t)
	driveID := insertWorkerDrive(t, pool)
	jobID := uuid.New()
	lockedAt := time.Now().UTC().Add(-2 * time.Minute)
	workerA := "worker-a"
	insertWorkerJob(
		t,
		pool,
		driveID,
		jobID,
		JobCleanupExpired,
		JobProcessing,
		10,
		1,
		4,
		time.Now().UTC(),
		&workerA,
		&lockedAt,
		map[string]string{"session_id": "session-1"},
	)

	reclaimer, err := NewJobPostgres(pool, "worker-b", RetryPolicy{
		MaxAttempts: 4,
		BaseBackoff: time.Second,
		MaxBackoff:  8 * time.Second,
		LockTimeout: time.Minute,
	})
	if err != nil {
		t.Fatal(err)
	}

	job, err := reclaimer.Claim(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if job.ID != jobID.String() {
		t.Fatalf("reclaimed job = %s, want %s", job.ID, jobID)
	}

	var status string
	var attempts int
	var lockedBy string
	if err := pool.QueryRow(context.Background(), `
		SELECT status::text, attempts, locked_by
		FROM cloud.jobs
		WHERE id = $1
	`, jobID).Scan(&status, &attempts, &lockedBy); err != nil {
		t.Fatal(err)
	}
	if status != string(JobProcessing) || attempts != 2 || lockedBy != "worker-b" {
		t.Fatalf("reclaimed row = status:%s attempts:%d locked_by:%s", status, attempts, lockedBy)
	}

	formerOwner, err := NewJobPostgres(pool, workerA, RetryPolicy{})
	if err != nil {
		t.Fatal(err)
	}
	if err := formerOwner.Complete(context.Background(), jobID.String()); err == nil {
		t.Fatal("old worker complete error = nil, want lease rejection")
	}

	if err := reclaimer.Complete(context.Background(), jobID.String()); err != nil {
		t.Fatal(err)
	}
	if err := reclaimer.Complete(context.Background(), jobID.String()); err != nil {
		t.Fatalf("complete idempotency error = %v", err)
	}

	var (
		completedAt       sql.NullTime
		completedLockedBy sql.NullString
	)
	if err := pool.QueryRow(context.Background(), `
		SELECT status::text, attempts, locked_by, completed_at
		FROM cloud.jobs
		WHERE id = $1
	`, jobID).Scan(&status, &attempts, &completedLockedBy, &completedAt); err != nil {
		t.Fatal(err)
	}
	if status != string(JobCompleted) || attempts != 2 || completedLockedBy.Valid || !completedAt.Valid {
		t.Fatalf("completed row = status:%s attempts:%d locked_by:%v", status, attempts, completedLockedBy)
	}
}
