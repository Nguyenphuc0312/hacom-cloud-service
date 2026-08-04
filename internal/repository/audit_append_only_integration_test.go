package repository

import (
	"context"
	"errors"
	"testing"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/quotarequest"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
)

func TestAuditLogRejectsUpdateAndDeleteWithoutMaintenanceGuard(t *testing.T) {
	service, repository := newQuotaRequestIntegrationService(t)
	ownerID := uuid.New()
	cleanupOwner(t, repository.pool, ownerID)
	created, err := service.Create(context.Background(), quotarequest.CreateCommand{OwnerUserID: ownerID, RequestedQuotaBytes: 10_000_000_000, IdempotencyKey: "audit-immutable"})
	if err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{
		`UPDATE cloud.audit_logs SET action='tampered' WHERE entity_id=$1`,
		`DELETE FROM cloud.audit_logs WHERE entity_id=$1`,
	} {
		_, err := repository.pool.Exec(context.Background(), statement, created.Request.ID)
		var postgresError *pgconn.PgError
		if err == nil || !errors.As(err, &postgresError) || postgresError.Code != "55000" {
			t.Fatalf("statement %q error=%v", statement, err)
		}
	}
}
