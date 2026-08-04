package auth

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"
)

const maxJWKSResponseBytes = 1 << 20

type jwk struct {
	KeyID     string   `json:"kid"`
	KeyType   string   `json:"kty"`
	Use       string   `json:"use"`
	Algorithm string   `json:"alg"`
	KeyOps    []string `json:"key_ops"`
	N         string   `json:"n"`
	E         string   `json:"e"`
	Curve     string   `json:"crv"`
	X         string   `json:"x"`
	Y         string   `json:"y"`
}

type jwksDocument struct {
	Keys []jwk `json:"keys"`
}

type jwksEnvelope struct {
	Keys []jwk         `json:"keys"`
	Data *jwksDocument `json:"data"`
}

type cachedSigningKey struct {
	algorithm string
	key       any
}

// RemoteJWKS caches public signing keys and coalesces refreshes so a key
// rotation or unknown kid cannot create a thundering herd against Auth.
type RemoteJWKS struct {
	url        string
	httpClient *http.Client
	cacheTTL   time.Duration
	now        func() time.Time

	mu         sync.RWMutex
	keys       map[string]cachedSigningKey
	expiresAt  time.Time
	staleUntil time.Time
	refresh    singleflight.Group
}

func NewRemoteJWKS(url string, client *http.Client, cacheTTL time.Duration) (*RemoteJWKS, error) {
	if url == "" {
		return nil, errors.New("JWKS URL is required")
	}
	if client == nil {
		return nil, errors.New("JWKS HTTP client is required")
	}
	if cacheTTL <= 0 {
		return nil, errors.New("JWKS cache TTL must be positive")
	}
	return &RemoteJWKS{
		url:        url,
		httpClient: client,
		cacheTTL:   cacheTTL,
		now:        time.Now,
		keys:       make(map[string]cachedSigningKey),
	}, nil
}

func (set *RemoteJWKS) Warm(ctx context.Context) error {
	return set.refreshKeys(ctx, false)
}

func (set *RemoteJWKS) Key(ctx context.Context, keyID, algorithm string) (any, error) {
	if keyID == "" {
		return nil, fmt.Errorf("%w: kid is required", ErrTokenInvalid)
	}

	key, found, fresh := set.cachedKey(keyID, algorithm)
	if found && fresh {
		return key, nil
	}

	if err := set.refreshKeys(ctx, !fresh || !found); err != nil {
		if found && set.canUseStaleKey() {
			// A known cached key remains cryptographically valid during a short
			// Auth/JWKS outage. Revocation is still checked separately and fails
			// closed, so this fallback does not bypass session invalidation.
			return key, nil
		}
		return nil, err
	}

	key, found, _ = set.cachedKey(keyID, algorithm)
	if !found {
		return nil, fmt.Errorf("%w: kid is unknown", ErrSigningKeyNotFound)
	}
	return key, nil
}

func (set *RemoteJWKS) canUseStaleKey() bool {
	set.mu.RLock()
	defer set.mu.RUnlock()
	return set.now().Before(set.staleUntil)
}

func (set *RemoteJWKS) cachedKey(keyID, algorithm string) (any, bool, bool) {
	set.mu.RLock()
	defer set.mu.RUnlock()
	entry, found := set.keys[keyID]
	if !found || entry.algorithm != algorithm {
		return nil, false, set.now().Before(set.expiresAt)
	}
	return entry.key, true, set.now().Before(set.expiresAt)
}

func (set *RemoteJWKS) refreshKeys(ctx context.Context, force bool) error {
	_, err, _ := set.refresh.Do("jwks-refresh", func() (any, error) {
		if !force {
			set.mu.RLock()
			fresh := set.now().Before(set.expiresAt)
			set.mu.RUnlock()
			if fresh {
				return nil, nil
			}
		}

		keys, err := set.fetchKeys(ctx)
		if err != nil {
			return nil, err
		}
		set.mu.Lock()
		set.keys = keys
		set.expiresAt = set.now().Add(set.cacheTTL)
		set.staleUntil = set.expiresAt.Add(set.cacheTTL)
		set.mu.Unlock()
		return nil, nil
	})
	return err
}

func (set *RemoteJWKS) fetchKeys(ctx context.Context) (map[string]cachedSigningKey, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, set.url, nil)
	if err != nil {
		return nil, fmt.Errorf("%w: build request", ErrSigningKeysUnavailable)
	}
	request.Header.Set("Accept", "application/json")

	response, err := set.httpClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf("%w: request failed", ErrSigningKeysUnavailable)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
		return nil, fmt.Errorf("%w: unexpected status %d", ErrSigningKeysUnavailable, response.StatusCode)
	}

	payload, err := io.ReadAll(io.LimitReader(response.Body, maxJWKSResponseBytes+1))
	if err != nil || len(payload) > maxJWKSResponseBytes {
		return nil, fmt.Errorf("%w: response is too large", ErrSigningKeysUnavailable)
	}
	var envelope jwksEnvelope
	if err := json.Unmarshal(payload, &envelope); err != nil {
		return nil, fmt.Errorf("%w: invalid JSON", ErrSigningKeysUnavailable)
	}
	if envelope.Data != nil {
		envelope.Keys = envelope.Data.Keys
	}
	if len(envelope.Keys) == 0 || len(envelope.Keys) > 64 {
		return nil, fmt.Errorf("%w: invalid key count", ErrSigningKeysUnavailable)
	}

	keys := make(map[string]cachedSigningKey, len(envelope.Keys))
	for _, value := range envelope.Keys {
		entry, err := parseJWK(value)
		if err != nil {
			return nil, fmt.Errorf("%w: invalid key", ErrSigningKeysUnavailable)
		}
		if _, duplicate := keys[value.KeyID]; duplicate {
			return nil, fmt.Errorf("%w: duplicate kid", ErrSigningKeysUnavailable)
		}
		keys[value.KeyID] = entry
	}
	return keys, nil
}

func parseJWK(value jwk) (cachedSigningKey, error) {
	if value.KeyID == "" || len(value.KeyID) > 128 {
		return cachedSigningKey{}, errors.New("kid is required")
	}
	if value.Use != "" && value.Use != "sig" {
		return cachedSigningKey{}, errors.New("key use must be sig")
	}
	for _, operation := range value.KeyOps {
		if operation == "verify" {
			goto keyOperationAccepted
		}
	}
	if len(value.KeyOps) > 0 {
		return cachedSigningKey{}, errors.New("key_ops must include verify")
	}

keyOperationAccepted:
	switch value.KeyType {
	case "RSA":
		if value.Algorithm != "" && value.Algorithm != "RS256" {
			return cachedSigningKey{}, errors.New("RSA key algorithm must be RS256")
		}
		modulus, err := decodeBase64URLInteger(value.N)
		if err != nil || modulus.Sign() <= 0 || modulus.BitLen() < 2048 || modulus.BitLen() > 8192 {
			return cachedSigningKey{}, errors.New("RSA modulus is invalid or too small")
		}
		exponentValue, err := base64.RawURLEncoding.DecodeString(value.E)
		if err != nil || len(exponentValue) == 0 || len(exponentValue) > 4 {
			return cachedSigningKey{}, errors.New("RSA exponent is invalid")
		}
		exponent := 0
		for _, current := range exponentValue {
			exponent = exponent<<8 | int(current)
		}
		if exponent < 3 || exponent%2 == 0 {
			return cachedSigningKey{}, errors.New("RSA exponent is invalid")
		}
		return cachedSigningKey{
			algorithm: "RS256",
			key:       &rsa.PublicKey{N: modulus, E: exponent},
		}, nil
	case "EC":
		if value.Algorithm != "" && value.Algorithm != "ES256" {
			return cachedSigningKey{}, errors.New("EC key algorithm must be ES256")
		}
		if value.Curve != "P-256" {
			return cachedSigningKey{}, errors.New("EC curve must be P-256")
		}
		x, err := decodeECPoint(value.X)
		if err != nil {
			return cachedSigningKey{}, errors.New("EC x coordinate is invalid")
		}
		y, err := decodeECPoint(value.Y)
		if err != nil || !elliptic.P256().IsOnCurve(x, y) {
			return cachedSigningKey{}, errors.New("EC point is invalid")
		}
		return cachedSigningKey{
			algorithm: "ES256",
			key:       &ecdsa.PublicKey{Curve: elliptic.P256(), X: x, Y: y},
		}, nil
	default:
		return cachedSigningKey{}, errors.New("unsupported JWK key type")
	}
}

func decodeECPoint(value string) (*big.Int, error) {
	decoded, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil || len(decoded) != 32 {
		return nil, errors.New("P-256 coordinate must contain 32 bytes")
	}
	return new(big.Int).SetBytes(decoded), nil
}

func decodeBase64URLInteger(value string) (*big.Int, error) {
	if value == "" {
		return nil, errors.New("base64url integer is empty")
	}
	decoded, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil || len(decoded) == 0 {
		return nil, errors.New("base64url integer is invalid")
	}
	return new(big.Int).SetBytes(decoded), nil
}
