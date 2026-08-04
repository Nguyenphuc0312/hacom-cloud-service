package auth

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

type fakeVerifier struct {
	principal Principal
	err       error
	token     string
}

func (verifier *fakeVerifier) Verify(_ context.Context, token string) (Principal, error) {
	verifier.token = token
	return verifier.principal, verifier.err
}

type fakeRevocationChecker struct {
	revoked   bool
	err       error
	principal Principal
}

func (checker *fakeRevocationChecker) IsRevoked(_ context.Context, principal Principal) (bool, error) {
	checker.principal = principal
	return checker.revoked, checker.err
}

func responseCode(response *httptest.ResponseRecorder) string {
	body := response.Body.String()
	for _, code := range []string{
		"DEMO_USER_REQUIRED",
		"AUTH_REQUIRED",
		"INVALID_ACCESS_TOKEN",
		"SESSION_REVOKED",
		"AUTH_AUTHORITY_UNAVAILABLE",
	} {
		if strings.Contains(body, `"code":"`+code+`"`) {
			return code
		}
	}
	return ""
}

func TestDemoAuthenticatorCreatesPrincipal(t *testing.T) {
	userID := uuid.New()
	called := false
	handler := DemoAuthenticator{}.Middleware(http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
		called = true
		principal, ok := PrincipalFromContext(request.Context())
		if !ok || principal.Subject != userID {
			t.Fatalf("principal = %+v, ok = %v", principal, ok)
		}
	}))
	request := httptest.NewRequest(http.MethodGet, "/quota", nil)
	request.Header.Set(DemoUserHeader, userID.String())
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if !called || response.Code != http.StatusOK {
		t.Fatalf("called = %v, status = %d", called, response.Code)
	}
}

func TestJWTAuthenticatorIgnoresForgedDemoHeader(t *testing.T) {
	verifiedUserID := uuid.New()
	forgedUserID := uuid.New()
	principal := Principal{
		Subject: verifiedUserID, SessionID: "session-1", TokenID: "token-1",
		IssuedAt: time.Now().Add(-time.Minute), ExpiresAt: time.Now().Add(time.Minute),
	}
	verifier := &fakeVerifier{principal: principal}
	checker := &fakeRevocationChecker{}
	authenticator, err := NewJWTAuthenticator(verifier, checker)
	if err != nil {
		t.Fatal(err)
	}
	handler := authenticator.Middleware(http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
		got, ok := PrincipalFromContext(request.Context())
		if !ok || got.Subject != verifiedUserID || got.Subject == forgedUserID {
			t.Fatalf("principal = %+v", got)
		}
	}))
	request := httptest.NewRequest(http.MethodPost, "/texts", nil)
	request.Header.Set("Authorization", "Bearer signed-token")
	request.Header.Set(DemoUserHeader, forgedUserID.String())
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || verifier.token != "signed-token" || checker.principal.Subject != verifiedUserID {
		t.Fatalf("status=%d token=%q checked=%+v", response.Code, verifier.token, checker.principal)
	}
}

func TestJWTAuthenticatorRejectsUnsafeRequests(t *testing.T) {
	principal := revocationPrincipal()
	tests := []struct {
		name       string
		header     string
		verifyErr  error
		revoked    bool
		revokeErr  error
		wantStatus int
		wantCode   string
	}{
		{name: "missing bearer", wantStatus: http.StatusUnauthorized, wantCode: "AUTH_REQUIRED"},
		{name: "malformed bearer", header: "Basic token", wantStatus: http.StatusUnauthorized, wantCode: "AUTH_REQUIRED"},
		{name: "invalid token", header: "Bearer token", verifyErr: ErrTokenInvalid, wantStatus: http.StatusUnauthorized, wantCode: "INVALID_ACCESS_TOKEN"},
		{name: "expired token", header: "Bearer token", verifyErr: ErrTokenExpired, wantStatus: http.StatusUnauthorized, wantCode: "INVALID_ACCESS_TOKEN"},
		{name: "JWKS unavailable", header: "Bearer token", verifyErr: ErrAuthAuthorityUnready, wantStatus: http.StatusServiceUnavailable, wantCode: "AUTH_AUTHORITY_UNAVAILABLE"},
		{name: "revoked token", header: "Bearer token", revoked: true, wantStatus: http.StatusUnauthorized, wantCode: "SESSION_REVOKED"},
		{name: "revocation unavailable", header: "Bearer token", revokeErr: errors.New("redis down"), wantStatus: http.StatusServiceUnavailable, wantCode: "AUTH_AUTHORITY_UNAVAILABLE"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			verifier := &fakeVerifier{principal: principal, err: test.verifyErr}
			checker := &fakeRevocationChecker{revoked: test.revoked, err: test.revokeErr}
			authenticator, err := NewJWTAuthenticator(verifier, checker)
			if err != nil {
				t.Fatal(err)
			}
			called := false
			handler := authenticator.Middleware(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
				called = true
			}))
			request := httptest.NewRequest(http.MethodPost, "/texts", nil)
			if test.header != "" {
				request.Header.Set("Authorization", test.header)
			}
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if called || response.Code != test.wantStatus || responseCode(response) != test.wantCode {
				t.Fatalf("called=%v status=%d code=%q body=%s", called, response.Code, responseCode(response), response.Body.String())
			}
			if response.Code == http.StatusUnauthorized && response.Header().Get("WWW-Authenticate") != "Bearer" {
				t.Fatalf("WWW-Authenticate = %q, want Bearer", response.Header().Get("WWW-Authenticate"))
			}
		})
	}
}
