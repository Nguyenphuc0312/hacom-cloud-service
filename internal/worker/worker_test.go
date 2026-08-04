package worker

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

type recordingRepository struct {
	mu        sync.Mutex
	jobs      []Job
	completed []string
	failed    []string
}

func (r *recordingRepository) Claim(context.Context) (Job, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.jobs) == 0 {
		return Job{}, ErrNoJob
	}
	job := r.jobs[0]
	r.jobs = r.jobs[1:]
	return job, nil
}

func (r *recordingRepository) Complete(_ context.Context, jobID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.completed = append(r.completed, jobID)
	return nil
}

func (r *recordingRepository) Fail(_ context.Context, jobID string, _ error) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.failed = append(r.failed, jobID)
	return nil
}

type handlerFunc func(context.Context, Job) error

func (fn handlerFunc) Handle(ctx context.Context, job Job) error {
	return fn(ctx, job)
}

type cleanupScannerFunc func(context.Context, int) (int, error)

func (fn cleanupScannerFunc) EnqueueExpiredUploadJobs(ctx context.Context, limit int) (int, error) {
	return fn(ctx, limit)
}

type trashScannerFunc func(context.Context, int) (int, error)

func (fn trashScannerFunc) EnqueueExpiredTrashJobs(ctx context.Context, limit int) (int, error) {
	return fn(ctx, limit)
}

func TestWorkerProcessesAndCompletesJob(t *testing.T) {
	repository := &recordingRepository{
		jobs: []Job{{ID: "job-1", Type: JobDemo}},
	}
	runner, err := New(repository, WithPollInterval(time.Millisecond))
	if err != nil {
		t.Fatal(err)
	}

	handled := make(chan struct{}, 1)
	err = runner.Register(JobDemo, handlerFunc(func(context.Context, Job) error {
		handled <- struct{}{}
		return nil
	}))
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- runner.Run(ctx) }()

	select {
	case <-handled:
		cancel()
	case <-time.After(time.Second):
		t.Fatal("job was not handled")
	}
	if err := <-done; err != nil {
		t.Fatalf("Run() error = %v", err)
	}

	repository.mu.Lock()
	defer repository.mu.Unlock()
	if len(repository.completed) != 1 || repository.completed[0] != "job-1" {
		t.Fatalf("completed jobs = %v, want [job-1]", repository.completed)
	}
}

func TestWorkerMarksHandlerFailure(t *testing.T) {
	repository := &recordingRepository{
		jobs: []Job{{ID: "job-2", Type: JobDemo}},
	}
	runner, err := New(repository, WithPollInterval(time.Millisecond))
	if err != nil {
		t.Fatal(err)
	}
	if err := runner.Register(JobDemo, handlerFunc(func(context.Context, Job) error {
		return errors.New("temporary failure")
	})); err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()
	if err := runner.Run(ctx); err != nil {
		t.Fatalf("Run() error = %v", err)
	}

	repository.mu.Lock()
	defer repository.mu.Unlock()
	if len(repository.failed) != 1 || repository.failed[0] != "job-2" {
		t.Fatalf("failed jobs = %v, want [job-2]", repository.failed)
	}
}

func TestRegisterRejectsDuplicateHandler(t *testing.T) {
	runner, err := New(NewDemoRepository())
	if err != nil {
		t.Fatal(err)
	}
	handler := handlerFunc(func(context.Context, Job) error { return nil })
	if err := runner.Register(JobDemo, handler); err != nil {
		t.Fatal(err)
	}
	if err := runner.Register(JobDemo, handler); err == nil {
		t.Fatal("Register() duplicate error = nil")
	}
}

func TestWorkerAppliesPerJobTimeoutAndMarksJobFailed(t *testing.T) {
	repository := &recordingRepository{
		jobs: []Job{{ID: "job-timeout", Type: JobHashFile}},
	}
	runner, err := New(
		repository,
		WithPollInterval(time.Millisecond),
		WithJobTimeout(10*time.Millisecond),
	)
	if err != nil {
		t.Fatal(err)
	}
	handlerObservedTimeout := make(chan struct{}, 1)
	if err := runner.Register(JobHashFile, handlerFunc(func(ctx context.Context, _ Job) error {
		<-ctx.Done()
		handlerObservedTimeout <- struct{}{}
		return ctx.Err()
	})); err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- runner.Run(ctx) }()

	select {
	case <-handlerObservedTimeout:
	case <-time.After(time.Second):
		t.Fatal("handler did not observe the per-job timeout")
	}
	waitForRepositoryState(t, repository, func(repository *recordingRepository) bool {
		return len(repository.failed) == 1
	})
	cancel()
	if err := <-done; err != nil {
		t.Fatalf("Run() error = %v", err)
	}

	repository.mu.Lock()
	defer repository.mu.Unlock()
	if len(repository.failed) != 1 || repository.failed[0] != "job-timeout" {
		t.Fatalf("failed jobs = %v, want [job-timeout]", repository.failed)
	}
	if len(repository.completed) != 0 {
		t.Fatalf("completed jobs = %v, want none", repository.completed)
	}
}

func TestWorkerShutdownCancelsHandlerAndLeavesLeaseForRecovery(t *testing.T) {
	repository := &recordingRepository{
		jobs: []Job{{ID: "job-shutdown", Type: JobHashFile}},
	}
	runner, err := New(
		repository,
		WithPollInterval(time.Millisecond),
		WithJobTimeout(time.Minute),
	)
	if err != nil {
		t.Fatal(err)
	}
	handlerStarted := make(chan struct{}, 1)
	handlerStopped := make(chan struct{}, 1)
	if err := runner.Register(JobHashFile, handlerFunc(func(ctx context.Context, _ Job) error {
		handlerStarted <- struct{}{}
		<-ctx.Done()
		handlerStopped <- struct{}{}
		return ctx.Err()
	})); err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- runner.Run(ctx) }()
	select {
	case <-handlerStarted:
		cancel()
	case <-time.After(time.Second):
		t.Fatal("handler did not start")
	}
	select {
	case <-handlerStopped:
	case <-time.After(time.Second):
		t.Fatal("handler did not stop after worker cancellation")
	}
	if err := <-done; err != nil {
		t.Fatalf("Run() error = %v", err)
	}

	repository.mu.Lock()
	defer repository.mu.Unlock()
	if len(repository.completed) != 0 {
		t.Fatalf("completed jobs = %v, want none", repository.completed)
	}
	if len(repository.failed) != 0 {
		t.Fatalf("failed jobs = %v, want none so another worker can recover the stale lease", repository.failed)
	}
}

func TestWorkerScansExpiredUploadsUsingConfiguredBatch(t *testing.T) {
	repository := &recordingRepository{}
	scanned := make(chan int, 1)
	runner, err := New(
		repository,
		WithPollInterval(time.Minute),
		WithCleanupScanner(
			cleanupScannerFunc(func(_ context.Context, limit int) (int, error) {
				scanned <- limit
				return 1, nil
			}),
			time.Minute,
			37,
		),
	)
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- runner.Run(ctx) }()
	select {
	case limit := <-scanned:
		if limit != 37 {
			t.Fatalf("cleanup batch limit = %d", limit)
		}
		cancel()
	case <-time.After(time.Second):
		t.Fatal("cleanup scan did not run")
	}
	if err := <-done; err != nil {
		t.Fatalf("Run() error = %v", err)
	}
}

func TestWorkerRejectsInvalidCleanupScannerConfiguration(t *testing.T) {
	scanner := cleanupScannerFunc(func(context.Context, int) (int, error) {
		return 0, nil
	})
	if _, err := New(
		&recordingRepository{},
		WithCleanupScanner(scanner, 0, 1),
	); err == nil {
		t.Fatal("New() with zero cleanup interval error = nil")
	}
	if _, err := New(
		&recordingRepository{},
		WithCleanupScanner(scanner, time.Second, 0),
	); err == nil {
		t.Fatal("New() with zero cleanup batch size error = nil")
	}
}

func TestWorkerScansExpiredTrashUsingConfiguredBatchAndRecordsMetric(t *testing.T) {
	metrics := NewMetrics()
	scanned := make(chan int, 1)
	runner, err := New(
		&recordingRepository{},
		WithPollInterval(time.Minute),
		WithMetrics(metrics),
		WithTrashScanner(trashScannerFunc(func(_ context.Context, limit int) (int, error) {
			scanned <- limit
			return 3, nil
		}), time.Minute, 37),
	)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- runner.Run(ctx) }()
	select {
	case limit := <-scanned:
		if limit != 37 {
			t.Fatalf("Trash scan limit=%d", limit)
		}
		cancel()
	case <-time.After(time.Second):
		t.Fatal("Trash scanner was not called")
	}
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	if metrics.Snapshot().PurgeScanned != 3 {
		t.Fatalf("metrics=%+v", metrics.Snapshot())
	}
}

func TestWorkerRejectsInvalidTrashScannerConfiguration(t *testing.T) {
	scanner := trashScannerFunc(func(context.Context, int) (int, error) { return 0, nil })
	if _, err := New(&recordingRepository{}, WithTrashScanner(scanner, 0, 1)); err == nil {
		t.Fatal("zero Trash interval error=nil")
	}
	if _, err := New(&recordingRepository{}, WithTrashScanner(scanner, time.Second, 0)); err == nil {
		t.Fatal("zero Trash batch error=nil")
	}
}

func TestWorkerRecordsTrashScannerFailure(t *testing.T) {
	metrics := NewMetrics()
	runner, err := New(
		&recordingRepository{},
		WithMetrics(metrics),
		WithTrashScanner(
			trashScannerFunc(func(context.Context, int) (int, error) {
				return 0, errors.New("scanner unavailable")
			}),
			time.Second,
			1,
		),
	)
	if err != nil {
		t.Fatal(err)
	}
	runner.scanExpiredTrash(context.Background())
	if metrics.Snapshot().PurgeFailed != 1 {
		t.Fatalf("metrics=%+v", metrics.Snapshot())
	}
}

func waitForRepositoryState(
	t *testing.T,
	repository *recordingRepository,
	condition func(*recordingRepository) bool,
) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		repository.mu.Lock()
		done := condition(repository)
		repository.mu.Unlock()
		if done {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("repository did not reach expected state")
}
