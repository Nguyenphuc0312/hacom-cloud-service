package repository

import (
	"context"
	"errors"
	"os"
	"sync"
	"testing"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/cloud"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func integrationPool(t *testing.T) *pgxpool.Pool {
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

func cleanupOwner(t *testing.T, pool *pgxpool.Pool, ownerID uuid.UUID) {
	t.Helper()
	t.Cleanup(func() {
		ctx := context.Background()
		_, err := pool.Exec(ctx, `
			WITH owned_drives AS (
				SELECT id FROM cloud.drives WHERE owner_user_id = $1
			),
			delete_ledger AS (
				DELETE FROM cloud.usage_ledger
				WHERE drive_id IN (SELECT id FROM owned_drives)
			),
			delete_items AS (
				DELETE FROM cloud.items
				WHERE drive_id IN (SELECT id FROM owned_drives)
			),
			delete_quotas AS (
				DELETE FROM cloud.quotas
				WHERE drive_id IN (SELECT id FROM owned_drives)
			)
			DELETE FROM cloud.drives WHERE owner_user_id = $1
		`, ownerID)
		if err != nil {
			t.Errorf("cleanup owner %s: %v", ownerID, err)
		}
	})
}

func TestCloudPostgresPersonalTimelineAndQuota(t *testing.T) {
	pool := integrationPool(t)
	repository, err := NewCloudPostgres(pool, 5_000_000_000)
	if err != nil {
		t.Fatal(err)
	}
	service, err := cloud.NewService(repository, 100_000_000)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	ownerA := uuid.New()
	ownerB := uuid.New()
	cleanupOwner(t, pool, ownerA)
	cleanupOwner(t, pool, ownerB)

	first, err := service.CreateText(ctx, ownerA, "Nội dung giống nhau")
	if err != nil {
		t.Fatal(err)
	}
	second, err := service.CreateText(ctx, ownerA, "Nội dung giống nhau")
	if err != nil {
		t.Fatal(err)
	}
	link, err := service.CreateLink(
		ctx,
		ownerA,
		"https://hacom.vn/cloud",
		"Tài liệu",
	)
	if err != nil {
		t.Fatal(err)
	}
	if first.ID == second.ID {
		t.Fatal("intentional duplicate content must create separate items")
	}

	pageOne, err := service.ListItems(ctx, ownerA, "", 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(pageOne.Items) != 2 || pageOne.NextCursor == "" {
		t.Fatalf("first page = %+v", pageOne)
	}
	pageTwo, err := service.ListItems(ctx, ownerA, pageOne.NextCursor, 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(pageTwo.Items) != 1 || pageTwo.NextCursor != "" {
		t.Fatalf("second page = %+v", pageTwo)
	}

	seen := map[uuid.UUID]bool{}
	for _, item := range append(pageOne.Items, pageTwo.Items...) {
		if seen[item.ID] {
			t.Fatalf("item %s appeared on multiple pages", item.ID)
		}
		seen[item.ID] = true
	}
	for _, expectedID := range []uuid.UUID{first.ID, second.ID, link.ID} {
		if !seen[expectedID] {
			t.Fatalf("item %s is missing from timeline", expectedID)
		}
	}

	if _, err := service.GetItem(ctx, ownerB, first.ID); !errors.Is(err, cloud.ErrNotFound) {
		t.Fatalf("cross-owner GetItem error = %v, want ErrNotFound", err)
	}
	if _, err := service.GetItem(ctx, ownerA, first.ID); err != nil {
		t.Fatalf("owner GetItem: %v", err)
	}

	quota, err := service.GetQuota(ctx, ownerA)
	if err != nil {
		t.Fatal(err)
	}
	wantUsed := first.SizeBytes + second.SizeBytes + link.SizeBytes
	if quota.UsedBytes != wantUsed {
		t.Fatalf("used bytes = %d, want %d", quota.UsedBytes, wantUsed)
	}

	var ledgerTotal int64
	var ledgerCount int
	err = pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(delta_used_bytes), 0), COUNT(*)
		FROM cloud.usage_ledger
		WHERE drive_id = $1
	`, quota.DriveID).Scan(&ledgerTotal, &ledgerCount)
	if err != nil {
		t.Fatal(err)
	}
	if ledgerTotal != quota.UsedBytes || ledgerCount != 3 {
		t.Fatalf(
			"ledger total/count = %d/%d, quota used = %d",
			ledgerTotal,
			ledgerCount,
			quota.UsedBytes,
		)
	}
}

func TestCloudPostgresConcurrentDriveCreationIsUnique(t *testing.T) {
	pool := integrationPool(t)
	repository, err := NewCloudPostgres(pool, 5_000_000_000)
	if err != nil {
		t.Fatal(err)
	}
	ownerID := uuid.New()
	cleanupOwner(t, pool, ownerID)

	const goroutines = 12
	var waitGroup sync.WaitGroup
	errorsChannel := make(chan error, goroutines)
	for range goroutines {
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			_, quotaErr := repository.GetQuota(context.Background(), ownerID)
			errorsChannel <- quotaErr
		}()
	}
	waitGroup.Wait()
	close(errorsChannel)
	for err := range errorsChannel {
		if err != nil {
			t.Fatalf("concurrent GetQuota: %v", err)
		}
	}

	var driveCount, quotaCount int
	err = pool.QueryRow(context.Background(), `
		SELECT
			COUNT(DISTINCT drive.id),
			COUNT(quota.drive_id)
		FROM cloud.drives AS drive
		LEFT JOIN cloud.quotas AS quota ON quota.drive_id = drive.id
		WHERE drive.owner_user_id = $1
	`, ownerID).Scan(&driveCount, &quotaCount)
	if err != nil {
		t.Fatal(err)
	}
	if driveCount != 1 || quotaCount != 1 {
		t.Fatalf("drive/quota count = %d/%d, want 1/1", driveCount, quotaCount)
	}
}

func TestCloudPostgresConcurrentQuotaCannotBeExceeded(t *testing.T) {
	pool := integrationPool(t)
	repository, err := NewCloudPostgres(pool, 10)
	if err != nil {
		t.Fatal(err)
	}
	service, err := cloud.NewService(repository, 100)
	if err != nil {
		t.Fatal(err)
	}
	ownerID := uuid.New()
	cleanupOwner(t, pool, ownerID)

	start := make(chan struct{})
	results := make(chan error, 2)
	var waitGroup sync.WaitGroup
	for range 2 {
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			<-start
			_, createErr := service.CreateText(
				context.Background(),
				ownerID,
				"123456",
			)
			results <- createErr
		}()
	}
	close(start)
	waitGroup.Wait()
	close(results)

	successes := 0
	quotaFailures := 0
	for result := range results {
		switch {
		case result == nil:
			successes++
		case errors.Is(result, cloud.ErrQuotaExceeded):
			quotaFailures++
		default:
			t.Fatalf("unexpected concurrent create error: %v", result)
		}
	}
	if successes != 1 || quotaFailures != 1 {
		t.Fatalf("success/quota failures = %d/%d, want 1/1", successes, quotaFailures)
	}

	quota, err := service.GetQuota(context.Background(), ownerID)
	if err != nil {
		t.Fatal(err)
	}
	if quota.UsedBytes != 6 {
		t.Fatalf("used bytes = %d, want 6", quota.UsedBytes)
	}

	var itemCount, ledgerCount int
	err = pool.QueryRow(context.Background(), `
		SELECT
			(SELECT COUNT(*) FROM cloud.items WHERE drive_id = $1),
			(SELECT COUNT(*) FROM cloud.usage_ledger WHERE drive_id = $1)
	`, quota.DriveID).Scan(&itemCount, &ledgerCount)
	if err != nil {
		t.Fatal(err)
	}
	if itemCount != 1 || ledgerCount != 1 {
		t.Fatalf("item/ledger count = %d/%d, want 1/1", itemCount, ledgerCount)
	}
}
