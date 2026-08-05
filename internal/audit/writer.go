package audit

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
)

type Execer interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}

type Entry struct {
	OccurredAt  time.Time
	ActorUserID *uuid.UUID
	ActorType   string
	RequestID   string
	Action      string
	EntityType  string
	EntityID    uuid.UUID
	DriveID     uuid.UUID
	Metadata    map[string]any
	AppendOnce  bool
}

// Append is the sole application write boundary for the append-only audit log.
// Actor fields are supplied by authenticated domain commands, never request JSON.
func Append(ctx context.Context, db Execer, entry Entry) error {
	if db == nil || entry.EntityID == uuid.Nil || entry.DriveID == uuid.Nil || strings.TrimSpace(entry.Action) == "" || strings.TrimSpace(entry.EntityType) == "" {
		return errors.New("invalid audit entry")
	}
	switch entry.ActorType {
	case "user", "admin":
		if entry.ActorUserID == nil || *entry.ActorUserID == uuid.Nil {
			return errors.New("human audit actor is required")
		}
	case "worker", "system":
		if entry.ActorUserID != nil {
			return errors.New("machine audit actor must not contain a user ID")
		}
	default:
		return errors.New("invalid audit actor type")
	}
	for key := range entry.Metadata {
		if key == "reason" || key == "fileMetadata" || key == "objectKey" || key == "bucket" {
			return fmt.Errorf("sensitive audit metadata key %q is forbidden", key)
		}
	}
	metadata, err := json.Marshal(entry.Metadata)
	if err != nil {
		return fmt.Errorf("encode audit metadata: %w", err)
	}
	occurredAt := any(nil)
	if !entry.OccurredAt.IsZero() {
		occurredAt = entry.OccurredAt
	}
	query := `INSERT INTO cloud.audit_logs(occurred_at,actor_user_id,actor_type,request_id,action,entity_type,entity_id,drive_id,metadata)
		SELECT COALESCE($1::timestamptz,NOW()),$2::uuid,$3::varchar(24),NULLIF($4::varchar(128),''),$5::varchar(96),$6::varchar(64),$7::uuid,$8::uuid,$9::jsonb`
	if entry.AppendOnce {
		query += ` WHERE NOT EXISTS (SELECT 1 FROM cloud.audit_logs WHERE request_id=NULLIF($4::varchar(128),'') AND action=$5::varchar(96))`
	}
	_, err = db.Exec(ctx, query, occurredAt, entry.ActorUserID, entry.ActorType, strings.TrimSpace(entry.RequestID), entry.Action, entry.EntityType, entry.EntityID, entry.DriveID, metadata)
	if err != nil {
		return fmt.Errorf("append audit entry: %w", err)
	}
	return nil
}
