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
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

var (
	ErrAuthRequired    = errors.New("authentication required")
	ErrInvalidToken    = errors.New("invalid access token")
	ErrTokenRevoked    = errors.New("access token revoked")
	ErrAuthUnavailable = errors.New("authentication authority unavailable")
	ErrForbidden       = errors.New("permission denied")
	ErrInvalidService  = errors.New("invalid service token")
)

type Claims struct {
	UserID            string     `json:"userId"`
	SessionID         string     `json:"sid"`
	TokenType         string     `json:"typ"`
	LegacyType        string     `json:"type"`
	TokenVersion      int64      `json:"tokenVersion"`
	PermissionVersion int64      `json:"permissionVersion"`
	Permissions       []string   `json:"permissions"`
	Scopes            StringList `json:"scope"`
	jwt.RegisteredClaims
}

// StringList accepts both OAuth's space-delimited scope string and the
// compatibility array emitted by older Auth tokens.
type StringList []string

func (s *StringList) UnmarshalJSON(data []byte) error {
	var text string
	if len(data) > 0 && data[0] == '"' {
		if err := json.Unmarshal(data, &text); err != nil {
			return err
		}
		*s = strings.Fields(text)
		return nil
	}
	var values []string
	if err := json.Unmarshal(data, &values); err != nil {
		return err
	}
	*s = values
	return nil
}

func (c Claims) Type() string {
	if c.TokenType != "" {
		return c.TokenType
	}
	return c.LegacyType
}

func (c Claims) OwnerID() (uuid.UUID, error) {
	value := c.RegisteredClaims.Subject
	if value == "" {
		value = c.UserID
	}
	id, err := uuid.Parse(value)
	if err != nil || id == uuid.Nil {
		return uuid.Nil, fmt.Errorf("invalid subject")
	}
	return id, nil
}

type RevocationChecker interface {
	Check(context.Context, Claims) error
}

type Config struct {
	JWKSURL                  string
	Issuer                   string
	Audience                 string
	JWKSCacheTTL             time.Duration
	HTTPClient               *http.Client
	RevocationChecker        RevocationChecker
	LegacyHS256VerifyEnabled bool
	LegacyHS256Secret        []byte
}

type Verifier struct {
	cfg       Config
	mu        sync.Mutex
	keys      map[string]any
	expiresAt time.Time
}

func NewVerifier(cfg Config) (*Verifier, error) {
	if strings.TrimSpace(cfg.Issuer) == "" || strings.TrimSpace(cfg.Audience) == "" {
		return nil, errors.New("auth issuer and audience are required")
	}
	if cfg.JWKSCacheTTL <= 0 {
		cfg.JWKSCacheTTL = 5 * time.Minute
	}
	if cfg.HTTPClient == nil {
		cfg.HTTPClient = &http.Client{Timeout: 5 * time.Second}
	}
	if cfg.JWKSURL == "" && !cfg.LegacyHS256VerifyEnabled {
		return nil, errors.New("auth JWKS URL is required")
	}
	return &Verifier{cfg: cfg}, nil
}

func (v *Verifier) VerifyAccessToken(ctx context.Context, raw string) (Claims, error) {
	claims, err := v.verify(ctx, raw)
	if err != nil {
		return Claims{}, err
	}
	if claims.Type() != "access" || claims.RegisteredClaims.Subject == "" || claims.SessionID == "" || claims.RegisteredClaims.ID == "" {
		return Claims{}, ErrInvalidToken
	}
	if _, err := claims.OwnerID(); err != nil {
		return Claims{}, ErrInvalidToken
	}
	if v.cfg.RevocationChecker != nil {
		if err := v.cfg.RevocationChecker.Check(ctx, claims); err != nil {
			if errors.Is(err, ErrTokenRevoked) || errors.Is(err, ErrAuthUnavailable) {
				return Claims{}, err
			}
			return Claims{}, ErrAuthUnavailable
		}
	}
	return claims, nil
}

func (v *Verifier) VerifyServiceToken(ctx context.Context, raw string, requiredScope string) (Claims, error) {
	claims, err := v.verify(ctx, raw)
	if err != nil || claims.Type() != "service" {
		return Claims{}, ErrInvalidService
	}
	if requiredScope != "" && !contains(claims.Scopes, requiredScope) {
		return Claims{}, ErrForbidden
	}
	return claims, nil
}

func (v *Verifier) VerifyAdminToken(ctx context.Context, raw string, requiredPermission string) (Claims, error) {
	claims, err := v.verify(ctx, raw)
	if err != nil || (claims.Type() != "admin_access" && claims.Type() != "access") {
		return Claims{}, ErrInvalidToken
	}
	if requiredPermission != "" && !contains(claims.Permissions, requiredPermission) {
		return Claims{}, ErrForbidden
	}
	return claims, nil
}

func (v *Verifier) verify(ctx context.Context, raw string) (Claims, error) {
	if strings.TrimSpace(raw) == "" {
		return Claims{}, ErrAuthRequired
	}
	parsed, err := jwt.ParseWithClaims(raw, &Claims{}, func(token *jwt.Token) (any, error) {
		alg := token.Method.Alg()
		if alg == "HS256" {
			if !v.cfg.LegacyHS256VerifyEnabled || len(v.cfg.LegacyHS256Secret) == 0 {
				return nil, ErrInvalidToken
			}
			return v.cfg.LegacyHS256Secret, nil
		}
		if alg != "RS256" && alg != "ES256" {
			return nil, ErrInvalidToken
		}
		kid, ok := token.Header["kid"].(string)
		if !ok || kid == "" {
			return nil, ErrInvalidToken
		}
		return v.key(ctx, kid, true)
	}, jwt.WithIssuer(v.cfg.Issuer), jwt.WithAudience(v.cfg.Audience), jwt.WithExpirationRequired(), jwt.WithIssuedAt())
	if err != nil || !parsed.Valid {
		return Claims{}, ErrInvalidToken
	}
	claims, ok := parsed.Claims.(*Claims)
	if !ok {
		return Claims{}, ErrInvalidToken
	}
	return *claims, nil
}

func (v *Verifier) key(ctx context.Context, kid string, refresh bool) (any, error) {
	v.mu.Lock()
	if key, ok := v.keys[kid]; ok && time.Now().Before(v.expiresAt) {
		v.mu.Unlock()
		return key, nil
	}
	v.mu.Unlock()
	if !refresh || v.cfg.JWKSURL == "" {
		return nil, ErrInvalidToken
	}
	keys, err := v.fetchKeys(ctx)
	if err != nil {
		return nil, ErrAuthUnavailable
	}
	if key, ok := keys[kid]; ok {
		return key, nil
	}
	return nil, ErrInvalidToken
}

type jwksResponse struct {
	Keys []jwk `json:"keys"`
}
type jwk struct {
	Kid string `json:"kid"`
	Kty string `json:"kty"`
	Alg string `json:"alg"`
	N   string `json:"n"`
	E   string `json:"e"`
	Crv string `json:"crv"`
	X   string `json:"x"`
	Y   string `json:"y"`
}

func (v *Verifier) fetchKeys(ctx context.Context) (map[string]any, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, v.cfg.JWKSURL, nil)
	if err != nil {
		return nil, ErrAuthUnavailable
	}
	resp, err := v.cfg.HTTPClient.Do(req)
	if err != nil {
		return nil, ErrAuthUnavailable
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, ErrAuthUnavailable
	}
	var payload jwksResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, ErrAuthUnavailable
	}
	keys := make(map[string]any, len(payload.Keys))
	for _, item := range payload.Keys {
		key, err := parseJWK(item)
		if err != nil || item.Kid == "" {
			continue
		}
		keys[item.Kid] = key
	}
	if len(keys) == 0 {
		return nil, ErrAuthUnavailable
	}
	v.mu.Lock()
	v.keys = keys
	v.expiresAt = time.Now().Add(v.cfg.JWKSCacheTTL)
	v.mu.Unlock()
	return keys, nil
}

func parseJWK(item jwk) (any, error) {
	decode := func(value string) ([]byte, error) { return base64.RawURLEncoding.DecodeString(value) }
	switch item.Kty {
	case "RSA":
		n, err := decode(item.N)
		if err != nil {
			return nil, err
		}
		e, err := decode(item.E)
		if err != nil {
			return nil, err
		}
		if len(e) == 0 {
			return nil, errors.New("empty RSA exponent")
		}
		exponent := 0
		for _, b := range e {
			exponent = exponent<<8 | int(b)
		}
		return &rsa.PublicKey{N: new(big.Int).SetBytes(n), E: exponent}, nil
	case "EC":
		var curve elliptic.Curve
		switch item.Crv {
		case "P-256":
			curve = elliptic.P256()
		default:
			return nil, errors.New("unsupported EC curve")
		}
		x, err := decode(item.X)
		if err != nil {
			return nil, err
		}
		y, err := decode(item.Y)
		if err != nil {
			return nil, err
		}
		return &ecdsa.PublicKey{Curve: curve, X: new(big.Int).SetBytes(x), Y: new(big.Int).SetBytes(y)}, nil
	default:
		return nil, errors.New("unsupported JWK type")
	}
}

func contains[T ~[]string](values T, wanted string) bool {
	for _, value := range values {
		if value == wanted {
			return true
		}
	}
	return false
}
