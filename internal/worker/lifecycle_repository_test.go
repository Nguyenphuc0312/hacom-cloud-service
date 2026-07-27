package worker

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

type fakeClock struct {
	mu  sync.Mutex
	now time.Time
}

func (clock *fakeClock) Time() time.Time {
	clock.mu.Lock()
	defer clock.mu.Unlock()
	return clock.now
}

func (clock *fakeClock) Advance(duration time.Duration) {
	clock.mu.Lock()
	defer clock.mu.Unlock()
	clock.now = clock.now.Add(duration)
}

func newLifecycleFixture(t *testing.T, maxAttempts int) (*LifecycleRepository, *fakeClock) {
	t.Helper()
	clock := &fakeClock{now: time.Date(2026, 7, 27, 10, 0, 0, 0, time.UTC)}
	repository, err := NewLifecycleRepository(RetryPolicy{
		MaxAttempts: maxAttempts,
		BaseBackoff: time.Second,
		MaxBackoff:  4 * time.Second,
		LockTimeout: 10 * time.Second,
	}, clock.Time)
	if err != nil {
		t.Fatal(err)
	}
	return repository, clock
}

func TestLifecycleRepositoryRetriesWithExponentialBackoff(t *testing.T) {
	repository, clock := newLifecycleFixture(t, 3)
	if err := repository.Enqueue(Job{ID: "job-1", Type: JobHashFile}); err != nil {
		t.Fatal(err)
	}

	job, err := repository.Claim(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if err := repository.Fail(context.Background(), job.ID, errors.New("MinIO unavailable")); err != nil {
		t.Fatal(err)
	}
	record, _ := repository.Get(job.ID)
	if record.Status != JobPending || record.Attempts != 1 ||
		!record.AvailableAt.Equal(clock.Time().Add(time.Second)) {
		t.Fatalf("first retry record = %+v", record)
	}
	if _, err := repository.Claim(context.Background()); !errors.Is(err, ErrNoJob) {
		t.Fatalf("claim before backoff error = %v, want ErrNoJob", err)
	}

	clock.Advance(time.Second)
	job, err = repository.Claim(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if err := repository.Fail(context.Background(), job.ID, errors.New("temporary database error")); err != nil {
		t.Fatal(err)
	}
	record, _ = repository.Get(job.ID)
	if record.Attempts != 2 || !record.AvailableAt.Equal(clock.Time().Add(2*time.Second)) {
		t.Fatalf("second retry record = %+v", record)
	}
}

func TestLifecycleRepositoryMovesJobToFailedAtMaxAttempts(t *testing.T) {
	repository, clock := newLifecycleFixture(t, 2)
	if err := repository.Enqueue(Job{ID: "job-1", Type: JobHashFile}); err != nil {
		t.Fatal(err)
	}

	for attempt := 0; attempt < 2; attempt++ {
		job, err := repository.Claim(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		if err := repository.Fail(context.Background(), job.ID, errors.New("permanent failure")); err != nil {
			t.Fatal(err)
		}
		clock.Advance(2 * time.Second)
	}

	record, _ := repository.Get("job-1")
	if record.Status != JobFailed || record.Attempts != 2 || record.LastError != "permanent failure" {
		t.Fatalf("failed job record = %+v", record)
	}
	if _, err := repository.Claim(context.Background()); !errors.Is(err, ErrNoJob) {
		t.Fatalf("claim failed job error = %v, want ErrNoJob", err)
	}
}

func TestLifecycleRepositoryRecoversStaleLockAfterWorkerRestart(t *testing.T) {
	repository, clock := newLifecycleFixture(t, 3)
	if err := repository.Enqueue(Job{ID: "job-1", Type: JobCleanupExpired}); err != nil {
		t.Fatal(err)
	}
	if _, err := repository.Claim(context.Background()); err != nil {
		t.Fatal(err)
	}

	clock.Advance(9 * time.Second)
	if _, err := repository.Claim(context.Background()); !errors.Is(err, ErrNoJob) {
		t.Fatalf("claim before lock timeout error = %v, want ErrNoJob", err)
	}
	clock.Advance(time.Second)
	reclaimed, err := repository.Claim(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	record, _ := repository.Get(reclaimed.ID)
	if reclaimed.ID != "job-1" || record.Status != JobProcessing || record.Attempts != 2 {
		t.Fatalf("reclaimed job = %+v record = %+v", reclaimed, record)
	}
}

func TestLifecycleRepositoryPreventsConcurrentDoubleClaim(t *testing.T) {
	repository, _ := newLifecycleFixture(t, 3)
	if err := repository.Enqueue(Job{ID: "job-1", Type: JobHashFile}); err != nil {
		t.Fatal(err)
	}

	const workers = 20
	var waitGroup sync.WaitGroup
	waitGroup.Add(workers)
	claimed := make(chan string, workers)
	for range workers {
		go func() {
			defer waitGroup.Done()
			job, err := repository.Claim(context.Background())
			if err == nil {
				claimed <- job.ID
			} else if !errors.Is(err, ErrNoJob) {
				t.Errorf("Claim() error = %v", err)
			}
		}()
	}
	waitGroup.Wait()
	close(claimed)

	var count int
	for range claimed {
		count++
	}
	if count != 1 {
		t.Fatalf("successful claims = %d, want 1", count)
	}
}

func TestLifecycleRepositoryCompletesRecoveredJob(t *testing.T) {
	repository, clock := newLifecycleFixture(t, 3)
	if err := repository.Enqueue(Job{ID: "job-1", Type: JobHashFile}); err != nil {
		t.Fatal(err)
	}
	if _, err := repository.Claim(context.Background()); err != nil {
		t.Fatal(err)
	}
	clock.Advance(10 * time.Second)

	job, err := repository.Claim(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if err := repository.Complete(context.Background(), job.ID); err != nil {
		t.Fatal(err)
	}
	record, _ := repository.Get(job.ID)
	if record.Status != JobCompleted || !record.LockedAt.IsZero() || record.LastError != "" {
		t.Fatalf("completed recovered job = %+v", record)
	}
}
