package upload

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"

	cloudfile "github.com/Nguyenphuc0312/hacom-cloud-service/internal/file"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/storage"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/worker"
)

var errObjectNotFound = errors.New("object not found")

type fakeObjectStore struct {
	mu      sync.Mutex
	objects map[string]storage.ObjectInfo
	deleted []string
	stats   int
}

func (s *fakeObjectStore) StatObject(_ context.Context, key string) (storage.ObjectInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.stats++
	info, exists := s.objects[key]
	if !exists {
		return storage.ObjectInfo{}, errObjectNotFound
	}
	return info, nil
}

func (s *fakeObjectStore) Delete(_ context.Context, key string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.objects, key)
	s.deleted = append(s.deleted, key)
	return nil
}

func newCompleteFixture(t *testing.T, declaredSize, actualSize int64) (*CompleteService, *MemoryCompletionRepository, *fakeObjectStore) {
	t.Helper()
	repository := NewMemoryCompletionRepository()
	repository.Seed(Session{
		ID:          "session-1",
		OwnerID:     "owner-1",
		ObjectKey:   "owner-1/object-1",
		FileName:    "report.pdf",
		ContentType: "application/pdf",
		SizeBytes:   declaredSize,
		Status:      SessionPending,
	}, CompletionQuota{
		ReservedBytes: declaredSize,
		LimitBytes:    5_000_000_000,
	})
	objects := &fakeObjectStore{objects: map[string]storage.ObjectInfo{
		"owner-1/object-1": {
			Key:         "owner-1/object-1",
			SizeBytes:   actualSize,
			ContentType: "application/pdf",
		},
	}}

	var idMu sync.Mutex
	idCounter := 0
	service, err := NewCompleteService(
		repository,
		objects,
		100_000_000,
		WithIDGenerator(func() (string, error) {
			idMu.Lock()
			defer idMu.Unlock()
			idCounter++
			return fmt.Sprintf("generated-%d", idCounter), nil
		}),
	)
	if err != nil {
		t.Fatal(err)
	}
	return service, repository, objects
}

func TestCompleteCreatesProcessingItemAndHashJobAtomically(t *testing.T) {
	service, repository, _ := newCompleteFixture(t, 1024, 1024)

	result, err := service.Complete(context.Background(), CompleteRequest{
		OwnerID:   "owner-1",
		SessionID: "session-1",
	})
	if err != nil {
		t.Fatal(err)
	}

	if result.Item.Status != cloudfile.StatusProcessing {
		t.Fatalf("item status = %q, want PROCESSING", result.Item.Status)
	}
	if result.Item.SizeBytes != 1024 || result.Item.ObjectKey != "owner-1/object-1" {
		t.Fatalf("unexpected item: %+v", result.Item)
	}
	if result.Job.Type != worker.JobHashFile {
		t.Fatalf("job type = %q, want HASH_FILE", result.Job.Type)
	}

	quota, itemCount, jobCount := repository.Snapshot("owner-1")
	if quota.ReservedBytes != 0 || quota.UsedBytes != 1024 {
		t.Fatalf("quota after complete = %+v", quota)
	}
	if itemCount != 1 || jobCount != 1 {
		t.Fatalf("items = %d, jobs = %d, want 1 and 1", itemCount, jobCount)
	}
}

func TestCompleteRetryReturnsSameResultWithoutDuplicateState(t *testing.T) {
	service, repository, objects := newCompleteFixture(t, 1024, 1024)
	request := CompleteRequest{OwnerID: "owner-1", SessionID: "session-1"}

	first, err := service.Complete(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	second, err := service.Complete(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}

	if first.Item.ID != second.Item.ID || first.Job.ID != second.Job.ID {
		t.Fatalf("retry returned a different result: first=%+v second=%+v", first, second)
	}
	quota, itemCount, jobCount := repository.Snapshot("owner-1")
	if quota.UsedBytes != 1024 || itemCount != 1 || jobCount != 1 {
		t.Fatalf("retry duplicated state: quota=%+v items=%d jobs=%d", quota, itemCount, jobCount)
	}
	if objects.stats != 1 {
		t.Fatalf("StatObject calls = %d, want 1", objects.stats)
	}
}

func TestConcurrentCompleteCreatesOneItemAndJob(t *testing.T) {
	service, repository, _ := newCompleteFixture(t, 1024, 1024)
	request := CompleteRequest{OwnerID: "owner-1", SessionID: "session-1"}

	const attempts = 20
	results := make(chan CompleteResult, attempts)
	errs := make(chan error, attempts)
	var waitGroup sync.WaitGroup
	waitGroup.Add(attempts)
	for range attempts {
		go func() {
			defer waitGroup.Done()
			result, err := service.Complete(context.Background(), request)
			results <- result
			errs <- err
		}()
	}
	waitGroup.Wait()
	close(results)
	close(errs)

	for err := range errs {
		if err != nil {
			t.Errorf("Complete() error = %v", err)
		}
	}
	var expected CompleteResult
	for result := range results {
		if expected.Item.ID == "" {
			expected = result
			continue
		}
		if result.Item.ID != expected.Item.ID || result.Job.ID != expected.Job.ID {
			t.Errorf("concurrent result = %+v, want IDs from %+v", result, expected)
		}
	}
	quota, itemCount, jobCount := repository.Snapshot("owner-1")
	if quota.UsedBytes != 1024 || quota.ReservedBytes != 0 || itemCount != 1 || jobCount != 1 {
		t.Fatalf("concurrent complete duplicated state: quota=%+v items=%d jobs=%d", quota, itemCount, jobCount)
	}
}

func TestCompleteRejectsSizeMismatchAndReleasesReservation(t *testing.T) {
	service, repository, objects := newCompleteFixture(t, 1024, 512)

	_, err := service.Complete(context.Background(), CompleteRequest{
		OwnerID:   "owner-1",
		SessionID: "session-1",
	})
	if !errors.Is(err, ErrObjectSizeMismatch) {
		t.Fatalf("error = %v, want ErrObjectSizeMismatch", err)
	}

	quota, itemCount, jobCount := repository.Snapshot("owner-1")
	if quota.ReservedBytes != 0 || quota.UsedBytes != 0 {
		t.Fatalf("invalid object quota = %+v", quota)
	}
	if itemCount != 0 || jobCount != 0 {
		t.Fatalf("invalid object created item/job: items=%d jobs=%d", itemCount, jobCount)
	}
	if len(objects.deleted) != 1 || objects.deleted[0] != "owner-1/object-1" {
		t.Fatalf("deleted objects = %v", objects.deleted)
	}
}

func TestCompleteRejectsObjectOver100MB(t *testing.T) {
	const tooLarge = int64(100*1024*1024 + 1)
	service, repository, _ := newCompleteFixture(t, tooLarge, tooLarge)

	_, err := service.Complete(context.Background(), CompleteRequest{
		OwnerID:   "owner-1",
		SessionID: "session-1",
	})
	if !errors.Is(err, ErrFileTooLarge) {
		t.Fatalf("error = %v, want ErrFileTooLarge", err)
	}
	quota, itemCount, jobCount := repository.Snapshot("owner-1")
	if quota.ReservedBytes != 0 || quota.UsedBytes != 0 || itemCount != 0 || jobCount != 0 {
		t.Fatalf("over-limit object changed finalized state: quota=%+v items=%d jobs=%d", quota, itemCount, jobCount)
	}
}

func TestCompleteRequiresExistingObject(t *testing.T) {
	service, repository, objects := newCompleteFixture(t, 1024, 1024)
	delete(objects.objects, "owner-1/object-1")

	_, err := service.Complete(context.Background(), CompleteRequest{
		OwnerID:   "owner-1",
		SessionID: "session-1",
	})
	if !errors.Is(err, errObjectNotFound) {
		t.Fatalf("error = %v, want object not found", err)
	}
	quota, itemCount, jobCount := repository.Snapshot("owner-1")
	if quota.ReservedBytes != 1024 || itemCount != 0 || jobCount != 0 {
		t.Fatalf("missing object changed state: quota=%+v items=%d jobs=%d", quota, itemCount, jobCount)
	}
}

func TestCompleteChecksOwnership(t *testing.T) {
	service, repository, _ := newCompleteFixture(t, 1024, 1024)

	_, err := service.Complete(context.Background(), CompleteRequest{
		OwnerID:   "another-owner",
		SessionID: "session-1",
	})
	if !errors.Is(err, ErrSessionForbidden) {
		t.Fatalf("error = %v, want ErrSessionForbidden", err)
	}
	quota, itemCount, jobCount := repository.Snapshot("owner-1")
	if quota.ReservedBytes != 1024 || itemCount != 0 || jobCount != 0 {
		t.Fatalf("forbidden request changed state: quota=%+v items=%d jobs=%d", quota, itemCount, jobCount)
	}
}
