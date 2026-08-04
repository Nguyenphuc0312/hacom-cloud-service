package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func rsaJWK(keyID string, publicKey *rsa.PublicKey) jwk {
	exponent := big.NewInt(int64(publicKey.E)).Bytes()
	return jwk{
		KeyID:     keyID,
		KeyType:   "RSA",
		Use:       "sig",
		Algorithm: "RS256",
		N:         base64.RawURLEncoding.EncodeToString(publicKey.N.Bytes()),
		E:         base64.RawURLEncoding.EncodeToString(exponent),
	}
}

func TestRemoteJWKSCoalescesConcurrentFetchesAndRefreshesUnknownKID(t *testing.T) {
	keyOne, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	keyTwo, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	var requestCount atomic.Int64
	var currentKeys atomic.Value
	currentKeys.Store([]jwk{rsaJWK("key-1", &keyOne.PublicKey)})
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		requestCount.Add(1)
		time.Sleep(10 * time.Millisecond)
		writer.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(writer).Encode(jwksEnvelope{Keys: currentKeys.Load().([]jwk)})
	}))
	defer server.Close()

	set, err := NewRemoteJWKS(server.URL, server.Client(), time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	var waitGroup sync.WaitGroup
	for range 25 {
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			if _, err := set.Key(context.Background(), "key-1", "RS256"); err != nil {
				t.Errorf("get key: %v", err)
			}
		}()
	}
	waitGroup.Wait()
	if requestCount.Load() != 1 {
		t.Fatalf("JWKS requests = %d, want 1", requestCount.Load())
	}

	currentKeys.Store([]jwk{
		rsaJWK("key-1", &keyOne.PublicKey),
		rsaJWK("key-2", &keyTwo.PublicKey),
	})
	if _, err := set.Key(context.Background(), "key-2", "RS256"); err != nil {
		t.Fatal(err)
	}
	if requestCount.Load() != 2 {
		t.Fatalf("JWKS requests after rotation = %d, want 2", requestCount.Load())
	}
}

func TestRemoteJWKSRejectsUnusableDocuments(t *testing.T) {
	tests := []struct {
		name string
		body any
	}{
		{name: "empty keys", body: jwksEnvelope{Keys: []jwk{}}},
		{name: "weak RSA", body: jwksEnvelope{Keys: []jwk{{
			KeyID: "weak", KeyType: "RSA", Algorithm: "RS256",
			N: base64.RawURLEncoding.EncodeToString(big.NewInt(17).Bytes()),
			E: base64.RawURLEncoding.EncodeToString(big.NewInt(3).Bytes()),
		}}}},
		{name: "signing use required", body: jwksEnvelope{Keys: []jwk{{
			KeyID: "enc", KeyType: "RSA", Use: "enc", Algorithm: "RS256",
			N: base64.RawURLEncoding.EncodeToString(new(big.Int).Lsh(big.NewInt(1), 2048).Bytes()),
			E: base64.RawURLEncoding.EncodeToString(big.NewInt(65537).Bytes()),
		}}}},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
				_ = json.NewEncoder(writer).Encode(test.body)
			}))
			defer server.Close()
			set, err := NewRemoteJWKS(server.URL, server.Client(), time.Minute)
			if err != nil {
				t.Fatal(err)
			}
			if err := set.Warm(context.Background()); err == nil {
				t.Fatal("expected unusable JWKS error")
			}
		})
	}
}

func TestRemoteJWKSBoundsStaleKeyFallback(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(writer).Encode(jwksEnvelope{Keys: []jwk{
			rsaJWK("key-1", &privateKey.PublicKey),
		}})
	}))
	cacheTTL := time.Minute
	set, err := NewRemoteJWKS(server.URL, server.Client(), cacheTTL)
	if err != nil {
		t.Fatal(err)
	}
	baseTime := time.Now().UTC()
	set.now = func() time.Time { return baseTime }
	if err := set.Warm(context.Background()); err != nil {
		t.Fatal(err)
	}
	server.Close()

	set.now = func() time.Time { return baseTime.Add(cacheTTL + 30*time.Second) }
	if _, err := set.Key(context.Background(), "key-1", "RS256"); err != nil {
		t.Fatalf("expected bounded stale fallback, got %v", err)
	}

	set.now = func() time.Time { return baseTime.Add(2*cacheTTL + time.Second) }
	if _, err := set.Key(context.Background(), "key-1", "RS256"); err == nil {
		t.Fatal("expected stale key to be rejected after the bounded fallback window")
	}
}
