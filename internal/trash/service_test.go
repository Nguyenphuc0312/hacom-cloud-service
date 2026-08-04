package trash

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
)

type fakeRepository struct {
	move    func(context.Context, MoveCommand) (Result, error)
	restore func(context.Context, Command) (Result, error)
	purge   func(context.Context, PurgeCommand) (Result, error)
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
