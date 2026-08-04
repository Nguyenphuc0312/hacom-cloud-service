package quotarequest

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/google/uuid"
)

type fakeRepository struct {
	create    func(context.Context, CreateCommand) (CreateResult, error)
	current   func(context.Context, uuid.UUID) (Request, error)
	adminList func(context.Context, AdminListFilter) (AdminPage, error)
	review    func(context.Context, ReviewCommand) (ReviewResult, error)
}

func (f fakeRepository) Create(ctx context.Context, command CreateCommand) (CreateResult, error) {
	return f.create(ctx, command)
}

func (f fakeRepository) Current(ctx context.Context, owner uuid.UUID) (Request, error) {
	return f.current(ctx, owner)
}

func (f fakeRepository) AdminList(ctx context.Context, filter AdminListFilter) (AdminPage, error) {
	return f.adminList(ctx, filter)
}

func (f fakeRepository) Review(ctx context.Context, command ReviewCommand) (ReviewResult, error) {
	return f.review(ctx, command)
}

func TestCreateValidatesTierAndNormalizesSensitiveReason(t *testing.T) {
	ownerID := uuid.New()
	reason := "  capacity for project A  "
	repository := fakeRepository{create: func(_ context.Context, command CreateCommand) (CreateResult, error) {
		if command.OwnerUserID != ownerID || command.RequestedQuotaBytes != 10_000_000_000 ||
			command.IdempotencyKey != "request-1" || command.Reason == nil || *command.Reason != "capacity for project A" {
			t.Fatalf("command=%+v", command)
		}
		return CreateResult{Applied: true}, nil
	}}
	service, err := NewService(repository, []int64{25_000_000_000, 10_000_000_000})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.Create(context.Background(), CreateCommand{
		OwnerUserID: ownerID, RequestedQuotaBytes: 10_000_000_000,
		IdempotencyKey: " request-1 ", Reason: &reason,
	}); err != nil {
		t.Fatal(err)
	}
	if got := service.Tiers(); len(got) != 2 || got[0] != 10_000_000_000 || got[1] != 25_000_000_000 {
		t.Fatalf("tiers=%v", got)
	}
}

func TestCreateRejectsInvalidInputWithoutRepositoryCall(t *testing.T) {
	repository := fakeRepository{create: func(context.Context, CreateCommand) (CreateResult, error) {
		t.Fatal("repository must not be called")
		return CreateResult{}, nil
	}}
	service, err := NewService(repository, []int64{10_000_000_000})
	if err != nil {
		t.Fatal(err)
	}
	longReason := strings.Repeat("a", MaxReasonRunes+1)
	tests := []struct {
		command CreateCommand
		want    error
	}{
		{CreateCommand{OwnerUserID: uuid.Nil, RequestedQuotaBytes: 10_000_000_000, IdempotencyKey: "key"}, ErrInvalidInput},
		{CreateCommand{OwnerUserID: uuid.New(), RequestedQuotaBytes: 12, IdempotencyKey: "key"}, ErrInvalidTier},
		{CreateCommand{OwnerUserID: uuid.New(), RequestedQuotaBytes: 10_000_000_000}, ErrInvalidInput},
		{CreateCommand{OwnerUserID: uuid.New(), RequestedQuotaBytes: 10_000_000_000, IdempotencyKey: "key", Reason: &longReason}, ErrInvalidInput},
	}
	for index, test := range tests {
		if _, err := service.Create(context.Background(), test.command); !errors.Is(err, test.want) {
			t.Fatalf("case %d error=%v want=%v", index, err, test.want)
		}
	}
}

func TestNewServiceRejectsUnsafeTierConfiguration(t *testing.T) {
	for _, tiers := range [][]int64{nil, {0}, {10, 10}} {
		if _, err := NewService(fakeRepository{}, tiers); err == nil {
			t.Fatalf("tiers=%v accepted", tiers)
		}
	}
}

func TestReviewValidatesActorDecisionIdempotencyAndNote(t *testing.T) {
	actorID, requestID := uuid.New(), uuid.New()
	note := "  approved after capacity review  "
	repository := fakeRepository{review: func(_ context.Context, command ReviewCommand) (ReviewResult, error) {
		if command.ActorUserID != actorID || command.RequestID != requestID || command.Decision != StatusApproved ||
			command.OperationID != "review-1" || command.Note == nil || *command.Note != "approved after capacity review" {
			t.Fatalf("command=%+v", command)
		}
		return ReviewResult{Applied: true}, nil
	}}
	service, err := NewService(repository, []int64{10_000_000_000})
	if err != nil {
		t.Fatal(err)
	}
	_, err = service.Review(context.Background(), ReviewCommand{RequestID: requestID, ActorUserID: actorID, Decision: StatusApproved, OperationID: " review-1 ", Note: &note})
	if err != nil {
		t.Fatal(err)
	}
}

func TestAdminReviewRejectsInvalidInputBeforeRepository(t *testing.T) {
	repository := fakeRepository{review: func(context.Context, ReviewCommand) (ReviewResult, error) {
		t.Fatal("repository must not be called")
		return ReviewResult{}, nil
	}}
	service, err := NewService(repository, []int64{10_000_000_000})
	if err != nil {
		t.Fatal(err)
	}
	for _, command := range []ReviewCommand{
		{RequestID: uuid.New(), ActorUserID: uuid.New(), Decision: StatusPending, OperationID: "key"},
		{RequestID: uuid.New(), ActorUserID: uuid.Nil, Decision: StatusApproved, OperationID: "key"},
		{RequestID: uuid.New(), ActorUserID: uuid.New(), Decision: StatusRejected},
	} {
		if _, err := service.Review(context.Background(), command); !errors.Is(err, ErrInvalidInput) {
			t.Fatalf("error=%v", err)
		}
	}
}
