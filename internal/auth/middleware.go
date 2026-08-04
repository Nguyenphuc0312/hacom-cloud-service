package auth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/google/uuid"
)

const DemoUserHeader = "X-Demo-User-ID"

type Verifier interface {
	Verify(ctx context.Context, rawToken string) (Principal, error)
}

type Authenticator interface {
	Middleware(next http.Handler) http.Handler
}

type DemoAuthenticator struct{}

func (DemoAuthenticator) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		rawUserID := strings.TrimSpace(request.Header.Get(DemoUserHeader))
		userID, err := uuid.Parse(rawUserID)
		if err != nil || userID == uuid.Nil {
			writeAuthError(
				writer,
				http.StatusUnauthorized,
				"DEMO_USER_REQUIRED",
				"X-Demo-User-ID must be a valid UUID",
			)
			return
		}
		principal := Principal{Subject: userID}
		next.ServeHTTP(writer, request.WithContext(WithPrincipal(request.Context(), principal)))
	})
}

type JWTAuthenticator struct {
	verifier     Verifier
	revocation   RevocationChecker
	accountState AccountStateChecker
}

func NewJWTAuthenticator(verifier Verifier, revocation RevocationChecker, accountState AccountStateChecker) (*JWTAuthenticator, error) {
	if verifier == nil {
		return nil, errors.New("token verifier is required")
	}
	if revocation == nil {
		return nil, errors.New("revocation checker is required")
	}
	if accountState == nil {
		return nil, errors.New("account-state checker is required")
	}
	return &JWTAuthenticator{verifier: verifier, revocation: revocation, accountState: accountState}, nil
}

func (authenticator *JWTAuthenticator) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		rawToken, err := readBearerToken(request.Header.Get("Authorization"))
		if err != nil {
			writeAuthError(writer, http.StatusUnauthorized, "AUTH_REQUIRED", "valid access token is required")
			return
		}

		principal, err := authenticator.verifier.Verify(request.Context(), rawToken)
		if err != nil {
			switch {
			case errors.Is(err, ErrAuthAuthorityUnready):
				writeAuthError(
					writer,
					http.StatusServiceUnavailable,
					"AUTH_AUTHORITY_UNAVAILABLE",
					"authentication authority is temporarily unavailable",
				)
			default:
				// All cryptographic/claim failures share one public code so the
				// endpoint cannot be used as a token-validation oracle.
				writeAuthError(writer, http.StatusUnauthorized, "INVALID_ACCESS_TOKEN", "access token is invalid")
			}
			return
		}

		revoked, err := authenticator.revocation.IsRevoked(request.Context(), principal)
		if err != nil {
			writeAuthError(
				writer,
				http.StatusServiceUnavailable,
				"AUTH_AUTHORITY_UNAVAILABLE",
				"authentication revocation authority is temporarily unavailable",
			)
			return
		}
		if revoked {
			writeAuthError(writer, http.StatusUnauthorized, "SESSION_REVOKED", "access token session has been revoked")
			return
		}

		decision, err := authenticator.accountState.Check(request.Context(), principal)
		if err != nil {
			writeAuthError(writer, http.StatusServiceUnavailable, "AUTH_AUTHORITY_UNAVAILABLE", "authentication account authority is temporarily unavailable")
			return
		}
		switch decision {
		case AuthorityAllowed:
		case AuthoritySessionRevoked:
			writeAuthError(writer, http.StatusUnauthorized, "SESSION_REVOKED", "access token session has been revoked")
			return
		case AuthorityAccountNotActive:
			writeAuthError(writer, http.StatusForbidden, "ACCOUNT_NOT_ACTIVE", "account is not active")
			return
		default:
			writeAuthError(writer, http.StatusServiceUnavailable, "AUTH_AUTHORITY_UNAVAILABLE", "authentication account authority returned an invalid decision")
			return
		}

		ctx := WithPrincipal(request.Context(), principal)
		next.ServeHTTP(writer, request.WithContext(ctx))
	})
}

func readBearerToken(header string) (string, error) {
	parts := strings.Fields(header)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || parts[1] == "" {
		return "", ErrCredentialsRequired
	}
	return parts[1], nil
}

func writeAuthError(writer http.ResponseWriter, status int, code, message string) {
	writer.Header().Set("Cache-Control", "no-store")
	writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	if status == http.StatusUnauthorized {
		writer.Header().Set("WWW-Authenticate", "Bearer")
	}
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(map[string]any{
		"error": map[string]string{
			"code":    code,
			"message": message,
		},
	})
}
