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
)

type Request struct {
	ID                  uuid.UUID
	DriveID             uuid.UUID
	RequestedByUserID   uuid.UUID
	Status              Status
	CurrentQuotaBytes   int64
	RequestedQuotaBytes int64
	Reason              *string
	CreatedAt           time.Time
	UpdatedAt           time.Time
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
