package auth

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type principalContextKey struct{}

// Principal is the verified user identity attached to every protected Cloud
// request. Subject is the canonical auth.users UUID from the JWT sub claim.
type Principal struct {
	Subject   uuid.UUID
	SessionID string
	TokenID   string
	IssuedAt  time.Time
	ExpiresAt time.Time
}

func WithPrincipal(ctx context.Context, principal Principal) context.Context {
	return context.WithValue(ctx, principalContextKey{}, principal)
}

func PrincipalFromContext(ctx context.Context) (Principal, bool) {
	principal, ok := ctx.Value(principalContextKey{}).(Principal)
	return principal, ok && principal.Subject != uuid.Nil
}

func OwnerUserID(ctx context.Context) uuid.UUID {
	principal, _ := PrincipalFromContext(ctx)
	return principal.Subject
}
