package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestVerifierAcceptsAccessTokenAndRefreshesUnknownJWK(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": []any{map[string]string{
			"kid": "key-1", "kty": "RSA", "alg": "RS256",
			"n": base64.RawURLEncoding.EncodeToString(key.PublicKey.N.Bytes()),
			"e": base64.RawURLEncoding.EncodeToString([]byte{1, 0, 1}),
		}}})
	}))
	defer server.Close()
	v, err := NewVerifier(Config{JWKSURL: server.URL, Issuer: "issuer", Audience: "cloud"})
	if err != nil {
		t.Fatal(err)
	}
	token := signedToken(t, key, "key-1", Claims{UserID: "", SessionID: "sid-1", TokenType: "access", RegisteredClaims: jwt.RegisteredClaims{
		Subject: "00000000-0000-0000-0000-000000000001", Issuer: "issuer", Audience: jwt.ClaimStrings{"cloud"},
		ID: "jti-1", IssuedAt: jwt.NewNumericDate(time.Now().Add(-time.Minute)), ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Minute)),
	}})
	claims, err := v.VerifyAccessToken(context.Background(), token)
	if err != nil {
		t.Fatalf("verify access token: %v", err)
	}
	if claims.RegisteredClaims.Subject == "" {
		t.Fatal("subject was not extracted")
	}

	bad := signedToken(t, key, "unknown-kid", Claims{SessionID: "sid-2", TokenType: "access", RegisteredClaims: jwt.RegisteredClaims{
		Subject: "00000000-0000-0000-0000-000000000001", Issuer: "issuer", Audience: jwt.ClaimStrings{"cloud"}, ID: "jti-2",
		IssuedAt: jwt.NewNumericDate(time.Now()), ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Minute)),
	}})
	if _, err := v.VerifyAccessToken(context.Background(), bad); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("unknown key error = %v", err)
	}
}

func TestVerifierRejectsWrongClaimsAndRevokedToken(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": []any{map[string]string{
			"kid": "key-1", "kty": "RSA", "alg": "RS256", "n": base64.RawURLEncoding.EncodeToString(key.PublicKey.N.Bytes()), "e": base64.RawURLEncoding.EncodeToString([]byte{1, 0, 1}),
		}}})
	}))
	defer server.Close()
	v, err := NewVerifier(Config{JWKSURL: server.URL, Issuer: "issuer", Audience: "cloud", RevocationChecker: revokedChecker{err: ErrTokenRevoked}})
	if err != nil {
		t.Fatal(err)
	}
	base := Claims{SessionID: "sid-1", TokenType: "access", RegisteredClaims: jwt.RegisteredClaims{Subject: "00000000-0000-0000-0000-000000000001", Issuer: "wrong", Audience: jwt.ClaimStrings{"cloud"}, ID: "jti-1", IssuedAt: jwt.NewNumericDate(time.Now()), ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Minute))}}
	if _, err := v.VerifyAccessToken(context.Background(), signedToken(t, key, "key-1", base)); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("wrong issuer error = %v", err)
	}
	base.Issuer = "issuer"
	if _, err := v.VerifyAccessToken(context.Background(), signedToken(t, key, "key-1", base)); !errors.Is(err, ErrTokenRevoked) {
		t.Fatalf("revoked error = %v", err)
	}
}

func TestVerifierEnforcesServiceScopeAndAdminPermission(t *testing.T) {
	secret := []byte("test-only-secret")
	v, err := NewVerifier(Config{Issuer: "issuer", Audience: "cloud", LegacyHS256VerifyEnabled: true, LegacyHS256Secret: secret})
	if err != nil {
		t.Fatal(err)
	}
	service := jwt.NewWithClaims(jwt.SigningMethodHS256, Claims{TokenType: "service", Scopes: []string{"cloud.read"}, RegisteredClaims: jwt.RegisteredClaims{Issuer: "issuer", Audience: jwt.ClaimStrings{"cloud"}, ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Minute)), IssuedAt: jwt.NewNumericDate(time.Now())}})
	serviceToken, err := service.SignedString(secret)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := v.VerifyServiceToken(context.Background(), serviceToken, "cloud.read"); err != nil {
		t.Fatalf("service scope should pass: %v", err)
	}
	if _, err := v.VerifyServiceToken(context.Background(), serviceToken, "cloud.write"); !errors.Is(err, ErrForbidden) {
		t.Fatalf("missing scope error = %v", err)
	}
	admin := jwt.NewWithClaims(jwt.SigningMethodHS256, Claims{TokenType: "admin_access", Permissions: []string{"cloud.quota.review"}, RegisteredClaims: jwt.RegisteredClaims{Issuer: "issuer", Audience: jwt.ClaimStrings{"cloud"}, ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Minute)), IssuedAt: jwt.NewNumericDate(time.Now())}})
	adminToken, err := admin.SignedString(secret)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := v.VerifyAdminToken(context.Background(), adminToken, "cloud.quota.review"); err != nil {
		t.Fatalf("admin permission should pass: %v", err)
	}
}

type revokedChecker struct{ err error }

func (r revokedChecker) Check(context.Context, Claims) error { return r.err }

func signedToken(t *testing.T, key *rsa.PrivateKey, kid string, claims Claims) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = kid
	value, err := token.SignedString(key)
	if err != nil {
		t.Fatal(err)
	}
	return value
}
