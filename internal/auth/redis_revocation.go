package auth

import (
	"context"
	"errors"
	"strconv"

	redis "github.com/redis/go-redis/v9"
)

// RedisRevocationChecker reads the invalidation markers written by
// chat-auth-service. Redis is an authority dependency: any non-Nil Redis
// failure is unavailable, never treated as a valid token.
type RedisRevocationChecker struct {
	Client redis.UniversalClient
}

func (c RedisRevocationChecker) Check(ctx context.Context, claims Claims) error {
	if c.Client == nil {
		return ErrAuthUnavailable
	}
	if claims.RegisteredClaims.Subject == "" || claims.RegisteredClaims.IssuedAt == nil || claims.SessionID == "" {
		return ErrInvalidToken
	}
	issuedAt := claims.RegisteredClaims.IssuedAt.Unix()
	for _, key := range []string{
		"auth_session_invalid_before:" + claims.SessionID,
		"auth_invalid_before:" + claims.RegisteredClaims.Subject,
	} {
		value, err := c.Client.Get(ctx, key).Result()
		if errors.Is(err, redis.Nil) {
			continue
		}
		if err != nil {
			return ErrAuthUnavailable
		}
		invalidBefore, err := strconv.ParseInt(value, 10, 64)
		if err != nil {
			return ErrAuthUnavailable
		}
		if issuedAt < invalidBefore {
			return ErrTokenRevoked
		}
	}
	return nil
}

var _ RevocationChecker = RedisRevocationChecker{}
