package repository

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/cloud"
	trashdomain "github.com/Nguyenphuc0312/hacom-cloud-service/internal/trash"
	"github.com/google/uuid"
)

func TestPhase3ActiveAndTrashSearchFilters(t *testing.T) {
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
	ownerID, otherOwnerID := uuid.New(), uuid.New()
	cleanupOwner(t, pool, ownerID)
	cleanupOwner(t, pool, otherOwnerID)

	oldText, err := service.CreateText(ctx, ownerID, "quarterly revenue baseline")
	if err != nil {
		t.Fatal(err)
	}
	newLink, err := service.CreateLink(ctx, ownerID, "https://reports.example/quarterly-result", "Board report")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.CreateText(ctx, otherOwnerID, "quarterly secret from another owner"); err != nil {
		t.Fatal(err)
	}
	from := time.Now().UTC().Add(-2 * time.Hour).Truncate(time.Microsecond)
	if _, err := pool.Exec(ctx, `UPDATE cloud.items SET created_at=$2 WHERE id=$1`, oldText.ID, from.Add(10*time.Minute)); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE cloud.items SET created_at=$2 WHERE id=$1`, newLink.ID, from.Add(time.Hour)); err != nil {
		t.Fatal(err)
	}

	page, err := service.ListItems(ctx, ownerID, cloud.ListRequest{Filter: cloud.ListFilter{Query: "quarterly"}})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 2 || page.Items[0].ID != newLink.ID || page.Items[1].ID != oldText.ID {
		t.Fatalf("owner-scoped timeline=%+v", page.Items)
	}
	page, err = service.ListItems(ctx, ownerID, cloud.ListRequest{Filter: cloud.ListFilter{
		Query: "quarterly", Type: cloud.ItemTypeText, From: from, To: from.Add(30 * time.Minute),
	}})
	if err != nil || len(page.Items) != 1 || page.Items[0].ID != oldText.ID {
		t.Fatalf("combined filter page=%+v error=%v", page, err)
	}
	page, err = service.ListItems(ctx, ownerID, cloud.ListRequest{Filter: cloud.ListFilter{Query: "Board report"}})
	if err != nil || len(page.Items) != 1 || page.Items[0].ID != newLink.ID {
		t.Fatalf("title search page=%+v error=%v", page, err)
	}

	trashStore, err := NewTrashPostgres(pool)
	if err != nil {
		t.Fatal(err)
	}
	trashService, err := trashdomain.NewService(trashStore, time.Now)
	if err != nil {
		t.Fatal(err)
	}
	deletedAt := time.Now().UTC()
	if _, err := pool.Exec(ctx, `
		UPDATE cloud.items SET status='trashed', deleted_at=$2::timestamptz, purge_after=$2::timestamptz + interval '24 hours'
		WHERE id=$1`, oldText.ID, deletedAt); err != nil {
		t.Fatal(err)
	}
	trashPage, err := trashService.List(ctx, ownerID, cloud.ListRequest{Filter: cloud.ListFilter{Query: "revenue", Type: cloud.ItemTypeText}})
	if err != nil || len(trashPage.Items) != 1 || trashPage.Items[0].ID != oldText.ID {
		t.Fatalf("Trash filter page=%+v error=%v", trashPage, err)
	}
}

func TestPhase3FileNameSearchAndFilterBoundCursor(t *testing.T) {
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
	ownerID := uuid.New()
	cleanupOwner(t, pool, ownerID)
	if _, err := service.CreateText(ctx, ownerID, "seed drive"); err != nil {
		t.Fatal(err)
	}
	if _, err := service.CreateText(ctx, ownerID, "forecast memo"); err != nil {
		t.Fatal(err)
	}
	var driveID uuid.UUID
	if err := pool.QueryRow(ctx, `SELECT id FROM cloud.drives WHERE owner_user_id=$1`, ownerID).Scan(&driveID); err != nil {
		t.Fatal(err)
	}
	objectID, itemID := uuid.New(), uuid.New()
	if _, err := pool.Exec(ctx, `
		INSERT INTO cloud.storage_objects
			(id,drive_id,bucket,object_key,original_name,content_type,declared_size_bytes,status)
		VALUES ($1,$2,'test-bucket',$3,'FY2026-forecast.xlsx','application/vnd.ms-excel',10,'ready')`,
		objectID, driveID, "search/"+objectID.String()); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO cloud.items (id,drive_id,item_type,status,storage_object_id,size_bytes,billable_bytes,created_at)
		VALUES ($1,$2,'file','ready',$3,10,10,NOW() + interval '1 minute')`, itemID, driveID, objectID); err != nil {
		t.Fatal(err)
	}
	partialPage, err := service.ListItems(ctx, ownerID, cloud.ListRequest{Filter: cloud.ListFilter{Query: "cast.xlsx"}})
	if err != nil || len(partialPage.Items) != 1 || partialPage.Items[0].ID != itemID {
		t.Fatalf("trigram file-name search page=%+v error=%v", partialPage, err)
	}
	page, err := service.ListItems(ctx, ownerID, cloud.ListRequest{Limit: 1, Filter: cloud.ListFilter{Query: "forecast"}})
	if err != nil || len(page.Items) != 1 || page.Items[0].ID != itemID {
		t.Fatalf("file-name search page=%+v error=%v", page, err)
	}
	if page.NextCursor == "" {
		t.Fatal("expected filter-bound next cursor")
	}
	if _, err := service.ListItems(ctx, ownerID, cloud.ListRequest{Cursor: page.NextCursor, Limit: 1, Filter: cloud.ListFilter{Query: "different"}}); !errors.Is(err, cloud.ErrInvalidCursor) {
		t.Fatalf("changed-filter cursor error=%v", err)
	}
}
