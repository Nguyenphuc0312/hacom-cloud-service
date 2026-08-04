package repository

import (
	"context"
	"errors"
	"sync"
	"testing"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/quotarequest"
	"github.com/google/uuid"
)

func newQuotaRequestIntegrationService(t *testing.T) (*quotarequest.Service, *QuotaRequestPostgres) {
	t.Helper()
	pool := integrationPool(t)
	repository, err := NewQuotaRequestPostgres(pool, 5_000_000_000)
	if err != nil {
		t.Fatal(err)
	}
	service, err := quotarequest.NewService(repository, []int64{10_000_000_000, 25_000_000_000})
	if err != nil {
		t.Fatal(err)
	}
	return service, repository
}

func TestQuotaRequestCreateRetryPendingAndTransactionalBoundary(t *testing.T) {
	service, repository := newQuotaRequestIntegrationService(t)
	ownerID := uuid.New()
	cleanupOwner(t, repository.pool, ownerID)
	reason := "sensitive customer launch details"
	command := quotarequest.CreateCommand{
		OwnerUserID: ownerID, RequestedQuotaBytes: 10_000_000_000,
		IdempotencyKey: "quota-create-1", Reason: &reason,
	}
	first, err := service.Create(context.Background(), command)
	if err != nil {
		t.Fatal(err)
	}
	if !first.Applied || first.Request.Status != quotarequest.StatusPending ||
		first.Request.CurrentQuotaBytes != 5_000_000_000 {
		t.Fatalf("first=%+v", first)
	}
	retry, err := service.Create(context.Background(), command)
	if err != nil || retry.Applied || retry.Request.ID != first.Request.ID {
		t.Fatalf("retry=%+v error=%v", retry, err)
	}
	changedReason := "different"
	command.Reason = &changedReason
	if _, err := service.Create(context.Background(), command); !errors.Is(err, quotarequest.ErrIdempotencyConflict) {
		t.Fatalf("changed idempotency payload error=%v", err)
	}
	if _, err := service.Create(context.Background(), quotarequest.CreateCommand{
		OwnerUserID: ownerID, RequestedQuotaBytes: 25_000_000_000, IdempotencyKey: "quota-create-2",
	}); !errors.Is(err, quotarequest.ErrPendingExists) {
		t.Fatalf("second pending error=%v", err)
	}
	current, err := service.Current(context.Background(), ownerID)
	if err != nil || current.ID != first.Request.ID {
		t.Fatalf("current=%+v error=%v", current, err)
	}

	var requests, audits, events int
	var auditContainsReason, eventContainsReason bool
	if err := repository.pool.QueryRow(context.Background(), `
		SELECT
		  (SELECT count(*) FROM cloud.quota_requests WHERE drive_id=$1),
		  (SELECT count(*) FROM cloud.audit_logs WHERE entity_id=$2 AND action='cloud.quota_request.created'),
		  (SELECT count(*) FROM cloud.outbox_events WHERE aggregate_id=$2 AND event_type='cloud.quota_request.created'),
		  EXISTS (SELECT 1 FROM cloud.audit_logs WHERE entity_id=$2 AND metadata::text LIKE '%' || $3 || '%'),
		  EXISTS (SELECT 1 FROM cloud.outbox_events WHERE aggregate_id=$2 AND payload::text LIKE '%' || $3 || '%')
	`, first.Request.DriveID, first.Request.ID, reason).Scan(
		&requests, &audits, &events, &auditContainsReason, &eventContainsReason,
	); err != nil {
		t.Fatal(err)
	}
	if requests != 1 || audits != 1 || events != 1 || auditContainsReason || eventContainsReason {
		t.Fatalf("requests=%d audits=%d events=%d reasonInAudit=%v reasonInEvent=%v",
			requests, audits, events, auditContainsReason, eventContainsReason)
	}
}

func TestQuotaRequestConcurrentCreateAllowsExactlyOnePending(t *testing.T) {
	service, repository := newQuotaRequestIntegrationService(t)
	ownerID := uuid.New()
	cleanupOwner(t, repository.pool, ownerID)
	const workers = 12
	start := make(chan struct{})
	results := make(chan error, workers)
	var waitGroup sync.WaitGroup
	waitGroup.Add(workers)
	for index := range workers {
		go func(index int) {
			defer waitGroup.Done()
			<-start
			_, err := service.Create(context.Background(), quotarequest.CreateCommand{
				OwnerUserID: ownerID, RequestedQuotaBytes: 10_000_000_000,
				IdempotencyKey: "concurrent-" + uuid.NewSHA1(uuid.Nil, []byte{byte(index)}).String(),
			})
			results <- err
		}(index)
	}
	close(start)
	waitGroup.Wait()
	close(results)
	succeeded, pending := 0, 0
	for err := range results {
		switch {
		case err == nil:
			succeeded++
		case errors.Is(err, quotarequest.ErrPendingExists):
			pending++
		default:
			t.Errorf("unexpected concurrent error=%v", err)
		}
	}
	if succeeded != 1 || pending != workers-1 {
		t.Fatalf("succeeded=%d pending=%d", succeeded, pending)
	}
	var requestCount, auditCount, eventCount int
	if err := repository.pool.QueryRow(context.Background(), `
		SELECT
		  (SELECT count(*) FROM cloud.quota_requests AS request JOIN cloud.drives AS drive ON drive.id=request.drive_id WHERE drive.owner_user_id=$1),
		  (SELECT count(*) FROM cloud.audit_logs AS audit JOIN cloud.drives AS drive ON drive.id=audit.drive_id WHERE drive.owner_user_id=$1 AND audit.action='cloud.quota_request.created'),
		  (SELECT count(*) FROM cloud.outbox_events AS event JOIN cloud.quota_requests AS request ON request.id=event.aggregate_id JOIN cloud.drives AS drive ON drive.id=request.drive_id WHERE drive.owner_user_id=$1)
	`, ownerID).Scan(&requestCount, &auditCount, &eventCount); err != nil {
		t.Fatal(err)
	}
	if requestCount != 1 || auditCount != 1 || eventCount != 1 {
		t.Fatalf("requests=%d audits=%d events=%d", requestCount, auditCount, eventCount)
	}
}

func TestQuotaRequestConcurrentIdempotentRetryCreatesOneBoundary(t *testing.T) {
	service, repository := newQuotaRequestIntegrationService(t)
	ownerID := uuid.New()
	cleanupOwner(t, repository.pool, ownerID)
	const workers = 12
	start := make(chan struct{})
	results := make(chan quotarequest.CreateResult, workers)
	errorsChannel := make(chan error, workers)
	var waitGroup sync.WaitGroup
	waitGroup.Add(workers)
	for range workers {
		go func() {
			defer waitGroup.Done()
			<-start
			result, err := service.Create(context.Background(), quotarequest.CreateCommand{
				OwnerUserID: ownerID, RequestedQuotaBytes: 10_000_000_000,
				IdempotencyKey: "same-concurrent-key",
			})
			results <- result
			errorsChannel <- err
		}()
	}
	close(start)
	waitGroup.Wait()
	close(results)
	close(errorsChannel)
	for err := range errorsChannel {
		if err != nil {
			t.Fatalf("concurrent retry error=%v", err)
		}
	}
	applied := 0
	var requestID uuid.UUID
	for result := range results {
		if result.Applied {
			applied++
		}
		if requestID == uuid.Nil {
			requestID = result.Request.ID
		} else if result.Request.ID != requestID {
			t.Fatalf("request IDs differ: %s != %s", result.Request.ID, requestID)
		}
	}
	if applied != 1 {
		t.Fatalf("applied=%d want=1", applied)
	}
	var audits, events int
	if err := repository.pool.QueryRow(context.Background(), `
		SELECT
		  (SELECT count(*) FROM cloud.audit_logs WHERE entity_id=$1),
		  (SELECT count(*) FROM cloud.outbox_events WHERE aggregate_id=$1)
	`, requestID).Scan(&audits, &events); err != nil {
		t.Fatal(err)
	}
	if audits != 1 || events != 1 {
		t.Fatalf("audits=%d events=%d", audits, events)
	}
}

func TestQuotaRequestCurrentIsOwnerScopedAndReturnsLatestState(t *testing.T) {
	service, repository := newQuotaRequestIntegrationService(t)
	ownerID, otherOwnerID := uuid.New(), uuid.New()
	cleanupOwner(t, repository.pool, ownerID)
	cleanupOwner(t, repository.pool, otherOwnerID)
	result, err := service.Create(context.Background(), quotarequest.CreateCommand{
		OwnerUserID: ownerID, RequestedQuotaBytes: 10_000_000_000, IdempotencyKey: "state-1",
	})
	if err != nil {
		t.Fatal(err)
	}
	reviewerID := uuid.New()
	tx, err := repository.pool.Begin(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback(context.Background()) }()
	var lockedID uuid.UUID
	if err := tx.QueryRow(context.Background(), `
		SELECT id FROM cloud.quota_requests WHERE id=$1 FOR UPDATE
	`, result.Request.ID).Scan(&lockedID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(context.Background(), `
		UPDATE cloud.quota_requests
		SET status='rejected', reviewed_by_user_id=$2, reviewed_at=NOW()
		WHERE id=$1
	`, result.Request.ID, reviewerID); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(context.Background()); err != nil {
		t.Fatal(err)
	}
	current, err := service.Current(context.Background(), ownerID)
	if err != nil || current.Status != quotarequest.StatusRejected {
		t.Fatalf("current=%+v error=%v", current, err)
	}
	if _, err := service.Current(context.Background(), otherOwnerID); !errors.Is(err, quotarequest.ErrNotFound) {
		t.Fatalf("cross-owner current error=%v", err)
	}
	second, err := service.Create(context.Background(), quotarequest.CreateCommand{
		OwnerUserID: ownerID, RequestedQuotaBytes: 25_000_000_000, IdempotencyKey: "state-2",
	})
	if err != nil || second.Request.Status != quotarequest.StatusPending {
		t.Fatalf("new request after rejected=%+v error=%v", second, err)
	}
}
