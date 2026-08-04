package audit

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
)

type recordingExecer struct{ args []any }

func (r *recordingExecer) Exec(_ context.Context, _ string, args ...any) (pgconn.CommandTag, error) {
	r.args = args
	return pgconn.NewCommandTag("INSERT 0 1"), nil
}

func TestAppendRejectsSensitiveMetadataAndMissingActor(t *testing.T) {
	db := &recordingExecer{}
	base := Entry{ActorType: "user", Action: "created", EntityType: "quota_request", EntityID: uuid.New(), DriveID: uuid.New()}
	if err := Append(context.Background(), db, base); err == nil {
		t.Fatal("expected missing human actor rejection")
	}
	actor := uuid.New()
	base.ActorUserID = &actor
	base.Metadata = map[string]any{"reason": "secret"}
	if err := Append(context.Background(), db, base); err == nil {
		t.Fatal("expected sensitive metadata rejection")
	}
}

func TestAppendAcceptsBoundedSafeEntry(t *testing.T) {
	db := &recordingExecer{}
	actor := uuid.New()
	err := Append(context.Background(), db, Entry{ActorType: "admin", ActorUserID: &actor, RequestID: "trace-1", Action: "approved", EntityType: "quota_request", EntityID: uuid.New(), DriveID: uuid.New(), Metadata: map[string]any{"reasonPresent": true}})
	if err != nil || len(db.args) != 9 {
		t.Fatalf("err=%v args=%d", err, len(db.args))
	}
}
