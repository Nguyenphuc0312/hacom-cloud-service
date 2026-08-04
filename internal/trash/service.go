package trash

import (
	"context"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/cloud"
	"github.com/google/uuid"
)

const maxOperationIDRunes = 128

type Repository interface {
	MoveToTrash(context.Context, MoveCommand) (Result, error)
	Restore(context.Context, Command) (Result, error)
	LogicalPurge(context.Context, PurgeCommand) (Result, error)
	ListTrash(context.Context, uuid.UUID, *cloud.Cursor, int) ([]cloud.Item, bool, error)
}

type Clock func() time.Time

type Service struct {
	repository Repository
	clock      Clock
}

func NewService(repository Repository, clock Clock) (*Service, error) {
	if repository == nil {
		return nil, fmt.Errorf("trash repository is required")
	}
	if clock == nil {
		clock = time.Now
	}
	return &Service{repository: repository, clock: clock}, nil
}

func (s *Service) MoveToTrash(
	ctx context.Context,
	ownerUserID, itemID uuid.UUID,
	operationID string,
) (Result, error) {
	command, err := s.command(ownerUserID, itemID, operationID)
	if err != nil {
		return Result{}, err
	}
	return s.repository.MoveToTrash(ctx, MoveCommand{
		Command:    command,
		PurgeAfter: command.OccurredAt.Add(Retention),
	})
}

func (s *Service) Restore(
	ctx context.Context,
	ownerUserID, itemID uuid.UUID,
	operationID string,
) (Result, error) {
	command, err := s.command(ownerUserID, itemID, operationID)
	if err != nil {
		return Result{}, err
	}
	return s.repository.Restore(ctx, command)
}

func (s *Service) List(
	ctx context.Context,
	ownerUserID uuid.UUID,
	cursorValue string,
	limit int,
) (Page, error) {
	if ownerUserID == uuid.Nil {
		return Page{}, fmt.Errorf("%w: owner user ID is required", ErrInvalidInput)
	}
	if limit == 0 {
		limit = cloud.DefaultPageSize
	}
	if limit < 1 || limit > cloud.MaxPageSize {
		return Page{}, fmt.Errorf(
			"%w: limit must be between 1 and %d",
			ErrInvalidInput,
			cloud.MaxPageSize,
		)
	}

	var cursor *cloud.Cursor
	if cursorValue != "" {
		decoded, err := cloud.DecodeCursor(cursorValue)
		if err != nil {
			return Page{}, err
		}
		cursor = &decoded
	}
	items, hasMore, err := s.repository.ListTrash(ctx, ownerUserID, cursor, limit)
	if err != nil {
		return Page{}, err
	}
	page := Page{Items: items}
	if hasMore && len(items) > 0 {
		last := items[len(items)-1]
		page.NextCursor, err = cloud.EncodeCursor(cloud.Cursor{
			CreatedAt: last.CreatedAt,
			ID:        last.ID,
		})
		if err != nil {
			return Page{}, fmt.Errorf("encode Trash cursor: %w", err)
		}
	}
	return page, nil
}

func (s *Service) DeleteImmediately(
	ctx context.Context,
	ownerUserID, itemID uuid.UUID,
	operationID string,
) (Result, error) {
	command, err := s.command(ownerUserID, itemID, operationID)
	if err != nil {
		return Result{}, err
	}
	return s.repository.LogicalPurge(ctx, PurgeCommand{Command: command})
}

func (s *Service) PermanentlyDelete(
	ctx context.Context,
	ownerUserID, itemID uuid.UUID,
	operationID string,
	expectedState ItemState,
	requireExpired bool,
) (Result, error) {
	command, err := s.command(ownerUserID, itemID, operationID)
	if err != nil {
		return Result{}, err
	}
	if expectedState != ItemStateReady && expectedState != ItemStateTrashed {
		return Result{}, fmt.Errorf(
			"%w: expected state must be ready or trashed",
			ErrInvalidInput,
		)
	}
	if requireExpired && expectedState != ItemStateTrashed {
		return Result{}, fmt.Errorf(
			"%w: expiry can only be required for a trashed item",
			ErrInvalidInput,
		)
	}
	return s.repository.LogicalPurge(ctx, PurgeCommand{
		Command:        command,
		ExpectedState:  expectedState,
		RequireExpired: requireExpired,
	})
}

func (s *Service) command(
	ownerUserID, itemID uuid.UUID,
	operationID string,
) (Command, error) {
	operationID = strings.TrimSpace(operationID)
	if ownerUserID == uuid.Nil || itemID == uuid.Nil {
		return Command{}, fmt.Errorf(
			"%w: owner and item IDs are required",
			ErrInvalidInput,
		)
	}
	if operationID == "" || utf8.RuneCountInString(operationID) > maxOperationIDRunes {
		return Command{}, fmt.Errorf(
			"%w: operation ID must contain 1 to %d characters",
			ErrInvalidInput,
			maxOperationIDRunes,
		)
	}
	return Command{
		OwnerUserID: ownerUserID,
		ItemID:      itemID,
		OperationID: operationID,
		OccurredAt:  s.clock().UTC(),
	}, nil
}
