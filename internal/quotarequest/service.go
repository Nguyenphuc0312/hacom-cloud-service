package quotarequest

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
)

const (
	MaxIdempotencyKeyBytes = 128
	MaxReasonRunes         = 1000
)

type Repository interface {
	Create(context.Context, CreateCommand) (CreateResult, error)
	Current(context.Context, uuid.UUID) (Request, error)
}

type Service struct {
	repository Repository
	tiers      []int64
}

func NewService(repository Repository, tiers []int64) (*Service, error) {
	if repository == nil {
		return nil, errors.New("quota-request repository is required")
	}
	if len(tiers) == 0 {
		return nil, errors.New("at least one quota-request tier is required")
	}
	validated := append([]int64(nil), tiers...)
	slices.Sort(validated)
	for index, tier := range validated {
		if tier <= 0 || (index > 0 && tier == validated[index-1]) {
			return nil, errors.New("quota-request tiers must be positive and unique")
		}
	}
	return &Service{repository: repository, tiers: validated}, nil
}

func (s *Service) Create(ctx context.Context, command CreateCommand) (CreateResult, error) {
	if command.OwnerUserID == uuid.Nil || command.RequestedQuotaBytes <= 0 {
		return CreateResult{}, ErrInvalidInput
	}
	command.IdempotencyKey = strings.TrimSpace(command.IdempotencyKey)
	if command.IdempotencyKey == "" || len(command.IdempotencyKey) > MaxIdempotencyKeyBytes {
		return CreateResult{}, fmt.Errorf("%w: Idempotency-Key must contain 1 to %d bytes", ErrInvalidInput, MaxIdempotencyKeyBytes)
	}
	if !slices.Contains(s.tiers, command.RequestedQuotaBytes) {
		return CreateResult{}, ErrInvalidTier
	}
	if command.Reason != nil {
		reason := strings.TrimSpace(*command.Reason)
		if reason == "" || utf8.RuneCountInString(reason) > MaxReasonRunes {
			return CreateResult{}, fmt.Errorf("%w: reason must contain 1 to %d characters", ErrInvalidInput, MaxReasonRunes)
		}
		command.Reason = &reason
	}
	return s.repository.Create(ctx, command)
}

func (s *Service) Current(ctx context.Context, ownerUserID uuid.UUID) (Request, error) {
	if ownerUserID == uuid.Nil {
		return Request{}, ErrInvalidInput
	}
	return s.repository.Current(ctx, ownerUserID)
}

func (s *Service) Tiers() []int64 {
	return append([]int64(nil), s.tiers...)
}
