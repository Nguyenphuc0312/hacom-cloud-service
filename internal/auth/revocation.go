package auth

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

type RevocationChecker interface {
	IsRevoked(ctx context.Context, principal Principal) (bool, error)
}

type RevocationStore interface {
	Get(ctx context.Context, key string) (value string, found bool, err error)
}

type RedisStore struct {
	client redis.Cmdable
}

func NewRedisStore(client redis.Cmdable) (*RedisStore, error) {
	if client == nil {
		return nil, errors.New("Redis client is required")
	}
	return &RedisStore{client: client}, nil
}

func (store *RedisStore) Get(ctx context.Context, key string) (string, bool, error) {
	value, err := store.client.Get(ctx, key).Result()
	if errors.Is(err, redis.Nil) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return value, true, nil
}

// RedisRevocationChecker follows the revocation keys owned by
// chat-auth-service. Any dependency or malformed-state error is returned to
// the middleware, which fails the protected request closed.
type RedisRevocationChecker struct {
	store   RevocationStore
	timeout time.Duration
}

func NewRedisRevocationChecker(store RevocationStore, timeout time.Duration) (*RedisRevocationChecker, error) {
	if store == nil {
		return nil, errors.New("revocation store is required")
	}
	if timeout <= 0 {
		return nil, errors.New("revocation timeout must be positive")
	}
	return &RedisRevocationChecker{store: store, timeout: timeout}, nil
}

func (checker *RedisRevocationChecker) IsRevoked(ctx context.Context, principal Principal) (bool, error) {
	checkCtx, cancel := context.WithTimeout(ctx, checker.timeout)
	defer cancel()

	if principal.Subject == uuid.Nil || principal.SessionID == "" || principal.TokenID == "" || principal.IssuedAt.IsZero() {
		return true, errors.New("revocation principal is incomplete")
	}

	blacklistValue, found, err := checker.store.Get(checkCtx, "blacklist:"+principal.TokenID)
	if err != nil {
		return true, fmt.Errorf("read token revocation: %w", err)
	}
	if found {
		if blacklistValue == "" {
			return true, errors.New("invalid token blacklist value")
		}
		return true, nil
	}

	revoked, err := checker.invalidBefore(
		checkCtx,
		"auth_session_invalid_before:"+principal.SessionID,
		principal.IssuedAt,
	)
	if err != nil || revoked {
		return revoked, err
	}

	return checker.invalidBefore(
		checkCtx,
		"auth_invalid_before:"+principal.Subject.String(),
		principal.IssuedAt,
	)
}

func (checker *RedisRevocationChecker) invalidBefore(
	ctx context.Context,
	key string,
	issuedAt time.Time,
) (bool, error) {
	rawValue, found, err := checker.store.Get(ctx, key)
	if err != nil {
		return true, fmt.Errorf("read invalid-before state: %w", err)
	}
	if !found {
		return false, nil
	}
	epoch, err := strconv.ParseInt(rawValue, 10, 64)
	if err != nil || epoch <= 0 {
		return true, errors.New("invalid revocation timestamp")
	}
	return issuedAt.Unix() < epoch, nil
}
