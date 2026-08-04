package trash

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/cloud"
	"github.com/google/uuid"
)

type fakeRepository struct {
	move    func(context.Context, MoveCommand) (Result, error)
	restore func(context.Context, Command) (Result, error)
	purge   func(context.Context, PurgeCommand) (Result, error)
	list    func(context.Context, uuid.UUID, *cloud.Cursor, int) ([]cloud.Item, bool, error)
}

func (r fakeRepository) MoveToTrash(ctx context.Context, command MoveCommand) (Result, error) {
	return r.move(ctx, command)
}

func (r fakeRepository) Restore(ctx context.Context, command Command) (Result, error) {
	return r.restore(ctx, command)
}

func (r fakeRepository) LogicalPurge(ctx context.Context, command PurgeCommand) (Result, error) {
	return r.purge(ctx, command)
}

func (r fakeRepository) ListTrash(
	ctx context.Context,
	ownerID uuid.UUID,
	cursor *cloud.Cursor,
	limit int,
) ([]cloud.Item, bool, error) {
	return r.list(ctx, ownerID, cursor, limit)
}

func TestMoveToTrashUsesExactlyTwentyFourHourRetention(t *testing.T) {
	now := time.Date(2026, 8, 4, 9, 30, 0, 0, time.FixedZone("ICT", 7*60*60))
	ownerID := uuid.New()
	itemID := uuid.New()
	repository := fakeRepository{
		move: func(_ context.Context, command MoveCommand) (Result, error) {
			if command.OwnerUserID != ownerID || command.ItemID != itemID {
				t.Fatalf("unexpected IDs: %+v", command)
			}
			if command.OperationID != "trash-request-1" {
				t.Fatalf("operation ID = %q", command.OperationID)
			}
			if !command.OccurredAt.Equal(now.UTC()) {
				t.Fatalf("occurred at = %s", command.OccurredAt)
			}
			if command.PurgeAfter.Sub(command.OccurredAt) != Retention {
				t.Fatalf("retention = %s", command.PurgeAfter.Sub(command.OccurredAt))
			}
			return Result{Action: ActionMoveToTrash}, nil
		},
	}
	service, err := NewService(repository, func() time.Time { return now })
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.MoveToTrash(
		context.Background(), ownerID, itemID, " trash-request-1 ",
	); err != nil {
		t.Fatal(err)
	}
}

func TestServiceRejectsInvalidLifecycleInput(t *testing.T) {
	service, err := NewService(fakeRepository{}, time.Now)
	if err != nil {
		t.Fatal(err)
	}
	tests := []func() error{
		func() error {
			_, callErr := service.Restore(context.Background(), uuid.Nil, uuid.New(), "op")
			return callErr
		},
		func() error {
			_, callErr := service.Restore(context.Background(), uuid.New(), uuid.Nil, "op")
			return callErr
		},
		func() error {
			_, callErr := service.Restore(context.Background(), uuid.New(), uuid.New(), " ")
			return callErr
		},
		func() error {
			_, callErr := service.PermanentlyDelete(
				context.Background(), uuid.New(), uuid.New(), "op", "processing", false,
			)
			return callErr
		},
		func() error {
			_, callErr := service.PermanentlyDelete(
				context.Background(), uuid.New(), uuid.New(), "op", ItemStateReady, true,
			)
			return callErr
		},
	}
	for index, test := range tests {
		if err := test(); !errors.Is(err, ErrInvalidInput) {
			t.Fatalf("case %d error = %v", index, err)
		}
	}
}

func TestNewServiceRequiresRepository(t *testing.T) {
	if _, err := NewService(nil, nil); err == nil {
		t.Fatal("expected missing repository error")
	}
}

func TestDeleteImmediatelyDoesNotTrustClientState(t *testing.T) {
	ownerID, itemID := uuid.New(), uuid.New()
	repository := fakeRepository{purge: func(_ context.Context, command PurgeCommand) (Result, error) {
		if command.OwnerUserID != ownerID || command.ItemID != itemID ||
			command.ExpectedState != "" || command.RequireExpired {
			t.Fatalf("unexpected command: %+v", command)
		}
		return Result{Action: ActionPurge, ItemID: itemID}, nil
	}}
	service, err := NewService(repository, time.Now)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.DeleteImmediately(
		context.Background(), ownerID, itemID, "delete-1",
	); err != nil {
		t.Fatal(err)
	}
}

func TestListUsesOpaqueCursorAndStablePageSize(t *testing.T) {
	ownerID, itemID := uuid.New(), uuid.New()
	createdAt := time.Now().UTC().Add(-time.Minute)
	cursor, err := cloud.EncodeCursor(cloud.Cursor{CreatedAt: createdAt, ID: itemID})
	if err != nil {
		t.Fatal(err)
	}
	repository := fakeRepository{list: func(
		_ context.Context, gotOwner uuid.UUID, gotCursor *cloud.Cursor, limit int,
	) ([]cloud.Item, bool, error) {
		if gotOwner != ownerID || gotCursor == nil || gotCursor.ID != itemID || limit != 5 {
			t.Fatalf("unexpected list input: %s %+v %d", gotOwner, gotCursor, limit)
		}
		return []cloud.Item{{ID: itemID, CreatedAt: createdAt}}, false, nil
	}}
	service, err := NewService(repository, time.Now)
	if err != nil {
		t.Fatal(err)
	}
	page, err := service.List(context.Background(), ownerID, cursor, 5)
	if err != nil || len(page.Items) != 1 {
		t.Fatalf("page=%+v error=%v", page, err)
	}
}
