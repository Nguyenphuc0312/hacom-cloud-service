package cloud

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

type ItemType string

const (
	ItemTypeText  ItemType = "text"
	ItemTypeLink  ItemType = "link"
	ItemTypeFile  ItemType = "file"
	ItemTypeImage ItemType = "image"
	ItemTypeVideo ItemType = "video"
	ItemTypeAudio ItemType = "audio"
)

type ItemStatus string

const (
	ItemStatusPending    ItemStatus = "pending"
	ItemStatusProcessing ItemStatus = "processing"
	ItemStatusReady      ItemStatus = "ready"
	ItemStatusFailed     ItemStatus = "failed"
)

const DriveStatusActive = "active"

var (
	ErrNotFound       = errors.New("cloud item not found")
	ErrQuotaExceeded  = errors.New("cloud quota exceeded")
	ErrDriveNotActive = errors.New("cloud drive is not active")
	ErrInvalidContent = errors.New("invalid cloud content")
	ErrInvalidCursor  = errors.New("invalid pagination cursor")
)

type Drive struct {
	ID          uuid.UUID
	OwnerUserID uuid.UUID
	Name        string
	Status      string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type Item struct {
	ID              uuid.UUID
	DriveID         uuid.UUID
	Type            ItemType
	Status          ItemStatus
	Title           *string
	TextContent     *string
	LinkURL         *string
	StorageObjectID uuid.UUID
	SizeBytes       int64
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

type Quota struct {
	DriveID       uuid.UUID
	LimitBytes    int64
	UsedBytes     int64
	ReservedBytes int64
	UpdatedAt     time.Time
}

func (q Quota) AvailableBytes() int64 {
	available := q.LimitBytes - q.UsedBytes - q.ReservedBytes
	if available < 0 {
		return 0
	}
	return available
}

type Cursor struct {
	CreatedAt time.Time
	ID        uuid.UUID
}

type Page struct {
	Items      []Item
	NextCursor string
}
