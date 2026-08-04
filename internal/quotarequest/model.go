package quotarequest

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

type Status string

const (
	StatusPending  Status = "pending"
	StatusApproved Status = "approved"
	StatusRejected Status = "rejected"
)

var (
	ErrInvalidInput        = errors.New("invalid quota request")
	ErrInvalidTier         = errors.New("requested quota tier is not allowed")
	ErrPendingExists       = errors.New("a pending quota request already exists")
	ErrIdempotencyConflict = errors.New("idempotency key conflicts with an existing quota request")
	ErrNotFound            = errors.New("quota request not found")
	ErrInvalidState        = errors.New("quota request is not pending")
	ErrQuotaBelowUsage     = errors.New("requested quota is below current consumption")
	ErrReviewConflict      = errors.New("review idempotency key conflicts with an existing decision")
)

type Request struct {
	ID                  uuid.UUID
	DriveID             uuid.UUID
	RequestedByUserID   uuid.UUID
	Status              Status
	CurrentQuotaBytes   int64
	RequestedQuotaBytes int64
	Reason              *string
	ReviewedByUserID    *uuid.UUID
	ReviewedAt          *time.Time
	ReviewNote          *string
	ReviewOperationID   *string
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

type AdminListFilter struct {
	Status Status
	Limit  int
	Cursor string
}

type AdminListItem struct {
	Request
	OwnerUserID   uuid.UUID
	QuotaBytes    int64
	UsedBytes     int64
	ReservedBytes int64
	TrashBytes    int64
}

type AdminPage struct {
	Items      []AdminListItem
	NextCursor string
}

type ReviewCommand struct {
	RequestID      uuid.UUID
	ActorUserID    uuid.UUID
	Decision       Status
	OperationID    string
	Note           *string
	RequestIDTrace string
}

type ReviewResult struct {
	Item    AdminListItem
	Applied bool
}

type CreateCommand struct {
	OwnerUserID         uuid.UUID
	RequestedQuotaBytes int64
	IdempotencyKey      string
	Reason              *string
}

type CreateResult struct {
	Request Request
	Applied bool
}
