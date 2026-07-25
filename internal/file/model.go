package file

import "time"

type Status string

const (
	StatusPending Status = "PENDING"
	StatusReady   Status = "READY"
	StatusDeleted Status = "DELETED"
	StatusFailed  Status = "FAILED"
)

// Item is cloud metadata. File bytes are stored in object storage, not PostgreSQL.
type Item struct {
	ID          string
	OwnerID     string
	Name        string
	ObjectKey   string
	ContentType string
	SizeBytes   int64
	Checksum    string
	Status      Status
	CreatedAt   time.Time
	UpdatedAt   time.Time
}
