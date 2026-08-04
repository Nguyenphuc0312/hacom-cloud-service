// Package trash owns the Phase 2 Trash lifecycle transaction contract.
package trash

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

const Retention = 24 * time.Hour

type Action string

const (
	ActionMoveToTrash Action = "trash"
	ActionRestore     Action = "restore"
	ActionPurge       Action = "purge"
)

type ItemState string

const (
	ItemStateReady   ItemState = "ready"
	ItemStateTrashed ItemState = "trashed"
)

var (
	ErrNotFound            = errors.New("trash item not found")
	ErrInvalidInput        = errors.New("invalid trash lifecycle input")
	ErrInvalidState        = errors.New("invalid trash lifecycle state")
	ErrRestoreExpired      = errors.New("trash restore window has expired")
	ErrIdempotencyConflict = errors.New("trash lifecycle idempotency conflict")
	ErrQuotaInvariant      = errors.New("trash quota invariant violated")
)

type Command struct {
	OwnerUserID uuid.UUID
	ItemID      uuid.UUID
	OperationID string
	OccurredAt  time.Time
}

type MoveCommand struct {
	Command
	PurgeAfter time.Time
}

type PurgeCommand struct {
	Command
	ExpectedState  ItemState
	RequireExpired bool
}

type Result struct {
	Action          Action
	ItemID          uuid.UUID
	DriveID         uuid.UUID
	PreviousState   ItemState
	CurrentState    *ItemState
	BillableBytes   int64
	UsedBytes       int64
	TrashBytes      int64
	DeletedAt       *time.Time
	PurgeAfter      *time.Time
	Applied         bool
	StorageDeletion bool
}
