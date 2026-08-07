package auth

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

type Mode string

const (
	ModeDemo Mode = "demo"
	ModeJWT  Mode = "jwt"
)

type Principal struct {
	UserID      uuid.UUID
	Subject     string
	SessionID   string
	TokenID     string
	Permissions []string
	Scopes      []string
	TokenType   string
}

type contextKey struct{}

func WithPrincipal(ctx context.Context, principal Principal) context.Context {
	return context.WithValue(ctx, contextKey{}, principal)
}

func PrincipalFromContext(ctx context.Context) (Principal, bool) {
	value, ok := ctx.Value(contextKey{}).(Principal)
	return value, ok
}

func PrincipalFromClaims(claims Claims) (Principal, error) {
	owner, err := claims.OwnerID()
	if err != nil {
		return Principal{}, ErrInvalidToken
	}
	return Principal{UserID: owner, Subject: claims.RegisteredClaims.Subject, SessionID: claims.SessionID, TokenID: claims.RegisteredClaims.ID, Permissions: claims.Permissions, Scopes: []string(claims.Scopes), TokenType: claims.Type()}, nil
}

func ReadBearerToken(header string) (string, error) {
	parts := strings.Fields(strings.TrimSpace(header))
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || parts[1] == "" {
		return "", ErrAuthRequired
	}
	return parts[1], nil
}

type MiddlewareConfig struct {
	Mode        Mode
	AppEnv      string
	Verifier    *Verifier
	RateLimiter *RateLimiter
}

func (c MiddlewareConfig) Validate() error {
	if c.Mode != ModeDemo && c.Mode != ModeJWT {
		return errors.New("AUTH_MODE must be demo or jwt")
	}
	if c.Mode == ModeDemo && c.AppEnv != "local" && c.AppEnv != "test" {
		return errors.New("demo auth is only allowed in local or test")
	}
	if c.Mode == ModeJWT && c.Verifier == nil {
		return errors.New("JWT verifier is required")
	}
	return nil
}

func Middleware(cfg MiddlewareConfig, next http.Handler) (http.Handler, error) {
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if cfg.RateLimiter != nil && !cfg.RateLimiter.Allow(clientKey(request)) {
			writeAuthError(writer, http.StatusTooManyRequests, "RATE_LIMITED", "rate limit exceeded")
			return
		}
		if cfg.Mode == ModeDemo {
			id, err := uuid.Parse(strings.TrimSpace(request.Header.Get("X-Demo-User-ID")))
			if err != nil || id == uuid.Nil {
				writeAuthError(writer, http.StatusUnauthorized, "AUTH_REQUIRED", "authentication required")
				return
			}
			request = request.WithContext(WithPrincipal(request.Context(), Principal{UserID: id, Subject: id.String(), TokenType: "demo"}))
			next.ServeHTTP(writer, request)
			return
		}
		raw, err := ReadBearerToken(request.Header.Get("Authorization"))
		if err != nil {
			writeAuthError(writer, http.StatusUnauthorized, "AUTH_REQUIRED", "authentication required")
			return
		}
		claims, err := cfg.Verifier.VerifyAccessToken(request.Context(), raw)
		if err != nil {
			status, code, message := http.StatusUnauthorized, "AUTH_INVALID", "invalid access token"
			if errors.Is(err, ErrAuthUnavailable) {
				status, code, message = http.StatusServiceUnavailable, "AUTH_UNAVAILABLE", "authentication authority unavailable"
			}
			if errors.Is(err, ErrTokenRevoked) {
				code, message = "AUTH_REVOKED", "access token revoked"
			}
			writeAuthError(writer, status, code, message)
			return
		}
		principal, err := PrincipalFromClaims(claims)
		if err != nil {
			writeAuthError(writer, http.StatusUnauthorized, "AUTH_INVALID", "invalid access token")
			return
		}
		next.ServeHTTP(writer, request.WithContext(WithPrincipal(request.Context(), principal)))
	}), nil
}

func RequirePermission(permission string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		principal, ok := PrincipalFromContext(request.Context())
		if !ok {
			writeAuthError(writer, http.StatusUnauthorized, "AUTH_REQUIRED", "authentication required")
			return
		}
		for _, value := range principal.Permissions {
			if value == permission {
				next.ServeHTTP(writer, request)
				return
			}
		}
		writeAuthError(writer, http.StatusForbidden, "FORBIDDEN", "permission denied")
	})
}

type bucket struct {
	started time.Time
	count   int
}
type RateLimiter struct {
	mu      sync.Mutex
	window  time.Duration
	limit   int
	buckets map[string]bucket
}

func NewRateLimiter(limit int, window time.Duration) (*RateLimiter, error) {
	if limit <= 0 || window <= 0 {
		return nil, errors.New("rate limit must be positive")
	}
	return &RateLimiter{limit: limit, window: window, buckets: make(map[string]bucket)}, nil
}

func (r *RateLimiter) Allow(key string) bool {
	now := time.Now()
	r.mu.Lock()
	defer r.mu.Unlock()
	current, ok := r.buckets[key]
	if !ok || now.Sub(current.started) >= r.window {
		r.buckets[key] = bucket{started: now, count: 1}
		return true
	}
	if current.count >= r.limit {
		return false
	}
	current.count++
	r.buckets[key] = current
	return true
}

func clientKey(request *http.Request) string {
	host, _, err := net.SplitHostPort(request.RemoteAddr)
	if err == nil && host != "" {
		return host
	}
	if request.RemoteAddr != "" {
		return request.RemoteAddr
	}
	return "unknown"
}

func writeAuthError(writer http.ResponseWriter, status int, code, message string) {
	writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(map[string]any{"error": map[string]string{"code": code, "message": message}})
}
