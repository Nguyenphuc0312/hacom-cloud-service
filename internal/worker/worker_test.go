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
