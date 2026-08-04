package handlers

import (
	"context"
	"errors"
	"testing"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/storage"
	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/worker"
	"github.com/google/uuid"
)

type memoryPermanentDeleteRepository struct {
	target           PermanentDeleteTarget
	getErr           error
	finalizeErr      error
	finalizeCalls    int
	finalized        bool
	finalizedMissing bool
}

func (r *memoryPermanentDeleteRepository) GetPermanentDeleteTarget(
	context.Context,
	uuid.UUID,
) (PermanentDeleteTarget, error) {
	if r.finalized {
		target := r.target
		target.AlreadyFinalized = true
		return target, nil
	}
	return r.target, r.getErr
}

func (r *memoryPermanentDeleteRepository) FinalizePermanentDelete(
	_ context.Context,
	_ uuid.UUID,
	missing bool,
) (bool, error) {
	r.finalizeCalls++
	if r.finalizeErr != nil {
		return false, r.finalizeErr
	}
	if r.finalized {
		return false, nil
	}
	r.finalized = true
	r.finalizedMissing = missing
	return true, nil
}

type permanentDeleteObjects struct {
	exists      bool
	statErr     error
	deleteErr   error
	statCalls   int
	deleteCalls int
}

func (o *permanentDeleteObjects) StatObject(context.Context, string) (storage.ObjectInfo, error) {
	o.statCalls++
	if o.statErr != nil {
		return storage.ObjectInfo{}, o.statErr
	}
	if !o.exists {
		return storage.ObjectInfo{}, storage.ErrObjectNotFound
	}
	return storage.ObjectInfo{Key: "objects/permanent-delete", SizeBytes: 17}, nil
}

func (o *permanentDeleteObjects) Delete(context.Context, string) error {
	o.deleteCalls++
	if o.deleteErr != nil {
		return o.deleteErr
	}
	if !o.exists {
		return storage.ErrObjectNotFound
	}
	o.exists = false
	return nil
}

type recordingPurgeMetrics struct {
	completed int
	missing   int
}

func (m *recordingPurgeMetrics) RecordPurgeCompleted(missing bool) {
	m.completed++
	if missing {
		m.missing++
	}
}

func permanentDeleteFixture(t *testing.T) (
	*PermanentDeleteHandler,
	*memoryPermanentDeleteRepository,
	*permanentDeleteObjects,
	*recordingPurgeMetrics,
	worker.Job,
) {
	t.Helper()
	jobID := uuid.New()
	repository := &memoryPermanentDeleteRepository{target: PermanentDeleteTarget{
		JobID: jobID, DriveID: uuid.New(), StorageObjectID: uuid.New(),
		ObjectKey: "objects/permanent-delete",
	}}
	objects := &permanentDeleteObjects{exists: true}
	metrics := &recordingPurgeMetrics{}
	handler, err := NewPermanentDeleteHandler(repository, objects, metrics)
	if err != nil {
		t.Fatal(err)
	}
	job, err := NewPermanentDeleteJob(jobID.String(), "delete-operation")
	if err != nil {
		t.Fatal(err)
	}
	return handler, repository, objects, metrics, job
}

func TestPermanentDeleteHandlerDeletesAndFinalizes(t *testing.T) {
	handler, repository, objects, metrics, job := permanentDeleteFixture(t)
	if err := handler.Handle(context.Background(), job); err != nil {
		t.Fatal(err)
	}
	if objects.deleteCalls != 1 || !repository.finalized || repository.finalizedMissing ||
		metrics.completed != 1 || metrics.missing != 0 {
		t.Fatalf("delete=%d repository=%+v metrics=%+v", objects.deleteCalls, repository, metrics)
	}
	if err := handler.Handle(context.Background(), job); err != nil {
		t.Fatal(err)
	}
	if objects.statCalls != 1 || repository.finalizeCalls != 1 || metrics.completed != 1 {
		t.Fatalf("finalized retry repeated side effects: objects=%+v repository=%+v metrics=%+v", objects, repository, metrics)
	}
}

func TestPermanentDeleteHandlerTreatsMissingObjectAsSuccess(t *testing.T) {
	handler, repository, objects, metrics, job := permanentDeleteFixture(t)
	objects.exists = false
	if err := handler.Handle(context.Background(), job); err != nil {
		t.Fatal(err)
	}
	if objects.deleteCalls != 0 || !repository.finalizedMissing || metrics.missing != 1 {
		t.Fatalf("objects=%+v repository=%+v metrics=%+v", objects, repository, metrics)
	}
}

func TestPermanentDeleteHandlerRecoversCrashAfterObjectDelete(t *testing.T) {
	handler, repository, objects, metrics, job := permanentDeleteFixture(t)
	repository.finalizeErr = errors.New("injected database outage after MinIO delete")
	if err := handler.Handle(context.Background(), job); err == nil {
		t.Fatal("first handle error=nil")
	}
	if objects.exists || objects.deleteCalls != 1 || repository.finalized {
		t.Fatalf("failure injection did not stop between delete/finalize: objects=%+v repository=%+v", objects, repository)
	}

	repository.finalizeErr = nil
	if err := handler.Handle(context.Background(), job); err != nil {
		t.Fatal(err)
	}
	if objects.deleteCalls != 1 || !repository.finalized || !repository.finalizedMissing ||
		metrics.completed != 1 || metrics.missing != 1 {
		t.Fatalf("recovery failed: objects=%+v repository=%+v metrics=%+v", objects, repository, metrics)
	}
}

func TestPermanentDeleteHandlerDoesNotFinalizeMinIOFailure(t *testing.T) {
	handler, repository, objects, _, job := permanentDeleteFixture(t)
	objects.deleteErr = errors.New("MinIO unavailable")
	if err := handler.Handle(context.Background(), job); err == nil {
		t.Fatal("Handle error=nil")
	}
	if repository.finalizeCalls != 0 {
		t.Fatalf("finalize calls=%d, want 0", repository.finalizeCalls)
	}
}

func TestPermanentDeleteHandlerRejectsUntrustedPayload(t *testing.T) {
	handler, _, _, _, job := permanentDeleteFixture(t)
	job.Payload = []byte(`{"operation_id":"delete-operation","object_key":"attacker/key"}`)
	if err := handler.Handle(context.Background(), job); err == nil {
		t.Fatal("unknown payload field error=nil")
	}
	job.Payload = []byte(`{"operation_id":""}`)
	if err := handler.Handle(context.Background(), job); err == nil {
		t.Fatal("blank operation ID error=nil")
	}
}
