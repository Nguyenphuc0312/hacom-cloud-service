package auth

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
)

type fakeRevocationStore struct {
	values map[string]string
	errors map[string]error
	keys   []string
}

func (store *fakeRevocationStore) Get(_ context.Context, key string) (string, bool, error) {
	store.keys = append(store.keys, key)
	if err := store.errors[key]; err != nil {
		return "", false, err
	}
	value, found := store.values[key]
	return value, found, nil
}

func revocationPrincipal() Principal {
	return Principal{
		Subject:   uuid.MustParse("11111111-1111-4111-8111-111111111111"),
		SessionID: "session-1",
		TokenID:   "token-1",
		IssuedAt:  time.Unix(100, 0),
		ExpiresAt: time.Unix(1000, 0),
	}
}

func TestRedisRevocationCheckerUsesHacomRevocationContract(t *testing.T) {
	tests := []struct {
		name        string
		values      map[string]string
		wantRevoked bool
	}{
		{name: "active", values: map[string]string{}, wantRevoked: false},
		{name: "blacklisted jti", values: map[string]string{
			"blacklist:token-1": "blacklisted",
		}, wantRevoked: true},
		{name: "session invalid before", values: map[string]string{
			"auth_session_invalid_before:session-1": "101",
		}, wantRevoked: true},
		{name: "user invalid before", values: map[string]string{
			"auth_invalid_before:11111111-1111-4111-8111-111111111111": "101",
		}, wantRevoked: true},
		{name: "same second remains active", values: map[string]string{
			"auth_invalid_before:11111111-1111-4111-8111-111111111111": "100",
		}, wantRevoked: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			checker, err := NewRedisRevocationChecker(&fakeRevocationStore{
				values: test.values,
				errors: map[string]error{},
			}, time.Second)
			if err != nil {
				t.Fatal(err)
			}
			revoked, err := checker.IsRevoked(context.Background(), revocationPrincipal())
			if err != nil {
				t.Fatal(err)
			}
			if revoked != test.wantRevoked {
				t.Fatalf("revoked = %v, want %v", revoked, test.wantRevoked)
			}
		})
	}
}

func TestRedisRevocationCheckerFailsClosed(t *testing.T) {
	tests := []struct {
		name   string
		values map[string]string
		errors map[string]error
	}{
		{name: "Redis unavailable", values: map[string]string{}, errors: map[string]error{
			"blacklist:token-1": errors.New("redis unavailable"),
		}},
		{name: "malformed session timestamp", values: map[string]string{
			"auth_session_invalid_before:session-1": "not-an-epoch",
		}, errors: map[string]error{}},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			checker, err := NewRedisRevocationChecker(&fakeRevocationStore{
				values: test.values,
				errors: test.errors,
			}, time.Second)
			if err != nil {
				t.Fatal(err)
			}
			revoked, err := checker.IsRevoked(context.Background(), revocationPrincipal())
			if err == nil || !revoked {
				t.Fatalf("revoked = %v, error = %v", revoked, err)
			}
		})
	}
}
