package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
)

func authorityTestClient(t *testing.T, serverURL string, httpClient *http.Client) *AuthorityClient {
	t.Helper()
	client, err := NewAuthorityClient(AuthorityClientConfig{
		ServiceTokenURL:         serverURL + "/internal/v1/auth/service-token",
		AccountStateURL:         serverURL + "/internal/v1/auth/check-account-state",
		VerificationContractURL: serverURL + "/internal/v1/auth/verification-contract",
		ClientID:                "hacom-cloud-service",
		ClientSecret:            "test-secret",
		Audience:                "chat-auth-service",
		ExpectedJWKSURL:         "https://auth.example.test/.well-known/jwks.json",
		ExpectedIssuer:          "chat-service",
		ExpectedAudiences:       []string{"chat-service", "hacom-cloud"},
	}, httpClient)
	if err != nil {
		t.Fatal(err)
	}
	return client
}

func writeTestJSON(t *testing.T, writer http.ResponseWriter, value any) {
	t.Helper()
	writer.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(writer).Encode(value); err != nil {
		t.Fatalf("encode response: %v", err)
	}
}

func TestAuthorityClientValidatesContractAndCachesServiceToken(t *testing.T) {
	var tokenCalls atomic.Int32
	var stateCalls atomic.Int32
	mux := http.NewServeMux()
	mux.HandleFunc("/internal/v1/auth/service-token", func(writer http.ResponseWriter, request *http.Request) {
		tokenCalls.Add(1)
		var body struct {
			ClientID     string `json:"clientId"`
			ClientSecret string `json:"clientSecret"`
			Audience     string `json:"audience"`
		}
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil || body.ClientID != "hacom-cloud-service" || body.ClientSecret != "test-secret" || body.Audience != "chat-auth-service" {
			t.Fatalf("unexpected service-token request: %+v, err=%v", body, err)
		}
		writeTestJSON(t, writer, map[string]any{"data": map[string]any{"accessToken": "service-token", "tokenType": "Bearer", "expiresIn": 300}})
	})
	mux.HandleFunc("/internal/v1/auth/verification-contract", func(writer http.ResponseWriter, request *http.Request) {
		if request.Header.Get("Authorization") != "Bearer service-token" {
			writer.WriteHeader(http.StatusUnauthorized)
			return
		}
		writeTestJSON(t, writer, map[string]any{"data": map[string]any{
			"jwksUrl": "https://auth.example.test/.well-known/jwks.json", "issuer": "chat-service",
			"audience": []string{"chat-service", "hacom-cloud"}, "algorithms": []string{"RS256"}, "jwksAvailable": true,
		}})
	})
	mux.HandleFunc("/internal/v1/auth/check-account-state", func(writer http.ResponseWriter, request *http.Request) {
		stateCalls.Add(1)
		if request.Header.Get("Authorization") != "Bearer service-token" {
			writer.WriteHeader(http.StatusUnauthorized)
			return
		}
		var body struct {
			UserID        string `json:"userId"`
			AuthSessionID string `json:"authSessionId"`
		}
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil || body.UserID == "" || body.AuthSessionID != "session-1" {
			t.Fatalf("unexpected account-state request: %+v, err=%v", body, err)
		}
		writeTestJSON(t, writer, map[string]any{"data": map[string]any{"allowed": true, "accountState": "ACTIVE", "status": "ACTIVE"}})
	})
	server := httptest.NewServer(mux)
	defer server.Close()
	client := authorityTestClient(t, server.URL, server.Client())

	if err := client.ValidateVerificationContract(context.Background()); err != nil {
		t.Fatalf("validate verification contract: %v", err)
	}
	principal := Principal{Subject: uuid.New(), SessionID: "session-1"}
	for range 2 {
		decision, err := client.Check(context.Background(), principal)
		if err != nil || decision != AuthorityAllowed {
			t.Fatalf("decision=%v err=%v", decision, err)
		}
	}
	if tokenCalls.Load() != 1 || stateCalls.Load() != 2 {
		t.Fatalf("token calls=%d state calls=%d", tokenCalls.Load(), stateCalls.Load())
	}
}

func TestAuthorityClientMapsDeniedStates(t *testing.T) {
	tests := []struct {
		name     string
		state    string
		reason   string
		decision AuthorityDecision
	}{
		{name: "disabled account", state: "DISABLED", reason: "ACCOUNT_DISABLED", decision: AuthorityAccountNotActive},
		{name: "pending account", state: "PENDING_HR_LINK", reason: "ACCOUNT_PENDING_HR_LINK", decision: AuthorityAccountNotActive},
		{name: "revoked session", state: "LOCKED", reason: "SESSION_REVOKED", decision: AuthoritySessionRevoked},
		{name: "missing session", state: "LOCKED", reason: "SESSION_NOT_FOUND", decision: AuthoritySessionRevoked},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			mux := http.NewServeMux()
			mux.HandleFunc("/internal/v1/auth/service-token", func(writer http.ResponseWriter, _ *http.Request) {
				writeTestJSON(t, writer, map[string]any{"data": map[string]any{"accessToken": "token", "tokenType": "Bearer", "expiresIn": 60}})
			})
			mux.HandleFunc("/internal/v1/auth/check-account-state", func(writer http.ResponseWriter, _ *http.Request) {
				writeTestJSON(t, writer, map[string]any{"data": map[string]any{"allowed": false, "accountState": test.state, "status": test.state, "reason": test.reason}})
			})
			server := httptest.NewServer(mux)
			defer server.Close()
			client := authorityTestClient(t, server.URL, server.Client())
			decision, err := client.Check(context.Background(), Principal{Subject: uuid.New(), SessionID: "sid"})
			if err != nil || decision != test.decision {
				t.Fatalf("decision=%v err=%v", decision, err)
			}
		})
	}
}

func TestAuthorityClientRefreshesRejectedServiceTokenOnce(t *testing.T) {
	var tokenCalls atomic.Int32
	var stateCalls atomic.Int32
	mux := http.NewServeMux()
	mux.HandleFunc("/internal/v1/auth/service-token", func(writer http.ResponseWriter, _ *http.Request) {
		call := tokenCalls.Add(1)
		writeTestJSON(t, writer, map[string]any{"data": map[string]any{"accessToken": "token-" + string(rune('0'+call)), "tokenType": "Bearer", "expiresIn": 300}})
	})
	mux.HandleFunc("/internal/v1/auth/check-account-state", func(writer http.ResponseWriter, request *http.Request) {
		stateCalls.Add(1)
		if request.Header.Get("Authorization") == "Bearer token-1" {
			writer.WriteHeader(http.StatusUnauthorized)
			return
		}
		writeTestJSON(t, writer, map[string]any{"data": map[string]any{"allowed": true, "accountState": "ACTIVE", "status": "ACTIVE"}})
	})
	server := httptest.NewServer(mux)
	defer server.Close()
	client := authorityTestClient(t, server.URL, server.Client())
	decision, err := client.Check(context.Background(), Principal{Subject: uuid.New(), SessionID: "sid"})
	if err != nil || decision != AuthorityAllowed || tokenCalls.Load() != 2 || stateCalls.Load() != 2 {
		t.Fatalf("decision=%v err=%v token calls=%d state calls=%d", decision, err, tokenCalls.Load(), stateCalls.Load())
	}
}

func TestAuthorityClientSingleflightsConcurrentTokenRequests(t *testing.T) {
	var tokenCalls atomic.Int32
	mux := http.NewServeMux()
	mux.HandleFunc("/internal/v1/auth/service-token", func(writer http.ResponseWriter, _ *http.Request) {
		tokenCalls.Add(1)
		time.Sleep(20 * time.Millisecond)
		writeTestJSON(t, writer, map[string]any{"data": map[string]any{"accessToken": "token", "tokenType": "Bearer", "expiresIn": 300}})
	})
	mux.HandleFunc("/internal/v1/auth/check-account-state", func(writer http.ResponseWriter, _ *http.Request) {
		writeTestJSON(t, writer, map[string]any{"data": map[string]any{"allowed": true, "accountState": "ACTIVE", "status": "ACTIVE"}})
	})
	server := httptest.NewServer(mux)
	defer server.Close()
	client := authorityTestClient(t, server.URL, server.Client())

	var wait sync.WaitGroup
	errorsFound := make(chan error, 16)
	for range 16 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			decision, err := client.Check(context.Background(), Principal{Subject: uuid.New(), SessionID: "sid"})
			if err != nil || decision != AuthorityAllowed {
				errorsFound <- err
			}
		}()
	}
	wait.Wait()
	close(errorsFound)
	if len(errorsFound) != 0 || tokenCalls.Load() != 1 {
		t.Fatalf("errors=%d token calls=%d", len(errorsFound), tokenCalls.Load())
	}
}

func TestAuthorityClientFailsClosedForMalformedAuthorityResponse(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/internal/v1/auth/service-token", func(writer http.ResponseWriter, _ *http.Request) {
		writeTestJSON(t, writer, map[string]any{"data": map[string]any{"accessToken": "token", "tokenType": "Bearer", "expiresIn": 300}})
	})
	mux.HandleFunc("/internal/v1/auth/check-account-state", func(writer http.ResponseWriter, _ *http.Request) {
		writeTestJSON(t, writer, map[string]any{"data": map[string]any{"allowed": true, "accountState": "LOCKED", "status": "ACTIVE"}})
	})
	server := httptest.NewServer(mux)
	defer server.Close()
	client := authorityTestClient(t, server.URL, server.Client())
	_, err := client.Check(context.Background(), Principal{Subject: uuid.New(), SessionID: "sid"})
	if err == nil {
		t.Fatal("expected malformed authority response to fail closed")
	}
}

func TestAuthorityClientRejectsSplitOriginsAndContractAudienceDrift(t *testing.T) {
	_, err := NewAuthorityClient(AuthorityClientConfig{
		ServiceTokenURL:         "https://auth.example.test/internal/v1/auth/service-token",
		AccountStateURL:         "https://attacker.invalid/check-account-state",
		VerificationContractURL: "https://auth.example.test/internal/v1/auth/verification-contract",
		ClientID:                "cloud",
		ClientSecret:            "secret",
		Audience:                "chat-auth-service",
		ExpectedJWKSURL:         "https://auth.example.test/jwks.json",
		ExpectedIssuer:          "chat-service",
		ExpectedAudiences:       []string{"chat-service"},
	}, http.DefaultClient)
	if err == nil {
		t.Fatal("expected split Auth origins to be rejected")
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/internal/v1/auth/service-token", func(writer http.ResponseWriter, _ *http.Request) {
		writeTestJSON(t, writer, map[string]any{"data": map[string]any{"accessToken": "token", "tokenType": "Bearer", "expiresIn": 300}})
	})
	mux.HandleFunc("/internal/v1/auth/verification-contract", func(writer http.ResponseWriter, _ *http.Request) {
		writeTestJSON(t, writer, map[string]any{"data": map[string]any{
			"jwksUrl": "https://auth.example.test/.well-known/jwks.json", "issuer": "chat-service",
			"audience": "chat-service", "algorithms": []string{"RS256"}, "jwksAvailable": true,
		}})
	})
	server := httptest.NewServer(mux)
	defer server.Close()
	client := authorityTestClient(t, server.URL, server.Client())
	if err := client.ValidateVerificationContract(context.Background()); err == nil {
		t.Fatal("expected an extra configured audience to fail closed")
	}
}
