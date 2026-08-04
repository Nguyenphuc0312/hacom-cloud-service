package auth

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"errors"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type staticSigningKeys struct {
	key       any
	err       error
	wantKeyID string
	wantAlg   string
}

func (keys staticSigningKeys) Key(_ context.Context, keyID, algorithm string) (any, error) {
	if keys.err != nil {
		return nil, keys.err
	}
	if keyID != keys.wantKeyID || algorithm != keys.wantAlg {
		return nil, ErrSigningKeyNotFound
	}
	return keys.key, nil
}

func validClaims(subject uuid.UUID, now time.Time) jwt.MapClaims {
	return jwt.MapClaims{
		"iss":    "chat-service",
		"aud":    []string{"chat-service"},
		"sub":    subject.String(),
		"userId": subject.String(),
		"sid":    "session-1",
		"jti":    "token-1",
		"typ":    "access",
		"type":   "access",
		"iat":    now.Unix(),
		"exp":    now.Add(15 * time.Minute).Unix(),
	}
}

func signToken(t *testing.T, method jwt.SigningMethod, key any, keyID string, claims jwt.MapClaims) string {
	t.Helper()
	token := jwt.NewWithClaims(method, claims)
	if keyID != "" {
		token.Header["kid"] = keyID
	}
	signed, err := token.SignedString(key)
	if err != nil {
		t.Fatal(err)
	}
	return signed
}

func TestTokenVerifierValidatesRequiredAccessClaims(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC().Truncate(time.Second)
	userID := uuid.New()
	verifier, err := NewTokenVerifier(staticSigningKeys{
		key:       &privateKey.PublicKey,
		wantKeyID: "rsa-1",
		wantAlg:   "RS256",
	}, VerifierConfig{
		Issuer:    "chat-service",
		Audiences: []string{"chat-service"},
		Leeway:    time.Second,
	})
	if err != nil {
		t.Fatal(err)
	}

	principal, err := verifier.Verify(
		context.Background(),
		signToken(t, jwt.SigningMethodRS256, privateKey, "rsa-1", validClaims(userID, now)),
	)
	if err != nil {
		t.Fatal(err)
	}
	if principal.Subject != userID || principal.SessionID != "session-1" || principal.TokenID != "token-1" {
		t.Fatalf("principal = %+v", principal)
	}
}

func TestTokenVerifierRejectsInvalidContracts(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC().Truncate(time.Second)
	userID := uuid.New()
	verifier, err := NewTokenVerifier(staticSigningKeys{
		key:       &privateKey.PublicKey,
		wantKeyID: "rsa-1",
		wantAlg:   "RS256",
	}, VerifierConfig{Issuer: "chat-service", Audiences: []string{"chat-service"}})
	if err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		name      string
		mutate    func(jwt.MapClaims)
		wantError error
	}{
		{name: "expired", wantError: ErrTokenExpired, mutate: func(claims jwt.MapClaims) {
			claims["iat"] = now.Add(-2 * time.Hour).Unix()
			claims["exp"] = now.Add(-time.Hour).Unix()
		}},
		{name: "wrong issuer", wantError: ErrTokenInvalid, mutate: func(claims jwt.MapClaims) {
			claims["iss"] = "other-service"
		}},
		{name: "wrong audience", wantError: ErrTokenInvalid, mutate: func(claims jwt.MapClaims) {
			claims["aud"] = []string{"other-service"}
		}},
		{name: "refresh token", wantError: ErrTokenInvalid, mutate: func(claims jwt.MapClaims) {
			claims["typ"] = "refresh"
			claims["type"] = "refresh"
		}},
		{name: "missing subject", wantError: ErrTokenInvalid, mutate: func(claims jwt.MapClaims) {
			delete(claims, "sub")
		}},
		{name: "missing session", wantError: ErrTokenInvalid, mutate: func(claims jwt.MapClaims) {
			delete(claims, "sid")
		}},
		{name: "missing token id", wantError: ErrTokenInvalid, mutate: func(claims jwt.MapClaims) {
			delete(claims, "jti")
		}},
		{name: "missing issued at", wantError: ErrTokenInvalid, mutate: func(claims jwt.MapClaims) {
			delete(claims, "iat")
		}},
		{name: "mismatched user alias", wantError: ErrTokenInvalid, mutate: func(claims jwt.MapClaims) {
			claims["userId"] = uuid.NewString()
		}},
		{name: "conflicting token types", wantError: ErrTokenInvalid, mutate: func(claims jwt.MapClaims) {
			claims["typ"] = "access"
			claims["type"] = "refresh"
		}},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			claims := validClaims(userID, now)
			test.mutate(claims)
			rawToken := signToken(t, jwt.SigningMethodRS256, privateKey, "rsa-1", claims)
			_, err := verifier.Verify(context.Background(), rawToken)
			if !errors.Is(err, test.wantError) {
				t.Fatalf("error = %v, want %v", err, test.wantError)
			}
		})
	}
}

func TestTokenVerifierSupportsES256(t *testing.T) {
	privateKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	verifier, err := NewTokenVerifier(staticSigningKeys{
		key:       &privateKey.PublicKey,
		wantKeyID: "ec-1",
		wantAlg:   "ES256",
	}, VerifierConfig{Issuer: "chat-service", Audiences: []string{"chat-service"}})
	if err != nil {
		t.Fatal(err)
	}
	_, err = verifier.Verify(context.Background(), signToken(
		t,
		jwt.SigningMethodES256,
		privateKey,
		"ec-1",
		validClaims(uuid.New(), time.Now().UTC()),
	))
	if err != nil {
		t.Fatal(err)
	}
}

func TestTokenVerifierPinsAlgorithmsAndLegacyHS256(t *testing.T) {
	secret := []byte("0123456789abcdef0123456789abcdef")
	rawToken := signToken(
		t,
		jwt.SigningMethodHS256,
		secret,
		"",
		validClaims(uuid.New(), time.Now().UTC()),
	)

	disabled, err := NewTokenVerifier(staticSigningKeys{}, VerifierConfig{
		Issuer:    "chat-service",
		Audiences: []string{"chat-service"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := disabled.Verify(context.Background(), rawToken); !errors.Is(err, ErrTokenInvalid) {
		t.Fatalf("disabled legacy error = %v", err)
	}

	enabled, err := NewTokenVerifier(staticSigningKeys{}, VerifierConfig{
		Issuer:             "chat-service",
		Audiences:          []string{"chat-service"},
		LegacyHS256Enabled: true,
		LegacyHS256Secret:  secret,
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := enabled.Verify(context.Background(), rawToken); err != nil {
		t.Fatal(err)
	}
}

func TestTokenVerifierMapsJWKSOutageToAuthorityUnavailable(t *testing.T) {
	verifier, err := NewTokenVerifier(staticSigningKeys{
		err:       ErrSigningKeysUnavailable,
		wantKeyID: "rsa-1",
		wantAlg:   "RS256",
	}, VerifierConfig{Issuer: "chat-service", Audiences: []string{"chat-service"}})
	if err != nil {
		t.Fatal(err)
	}
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	_, err = verifier.Verify(context.Background(), signToken(
		t,
		jwt.SigningMethodRS256,
		privateKey,
		"rsa-1",
		validClaims(uuid.New(), time.Now().UTC()),
	))
	if !errors.Is(err, ErrAuthAuthorityUnready) {
		t.Fatalf("error = %v", err)
	}
}
