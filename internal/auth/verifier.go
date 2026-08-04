package auth

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type SigningKeySource interface {
	Key(ctx context.Context, keyID, algorithm string) (any, error)
}

type VerifierConfig struct {
	Issuer             string
	Audiences          []string
	Leeway             time.Duration
	LegacyHS256Enabled bool
	LegacyHS256Secret  []byte
}

type accessTokenClaims struct {
	jwt.RegisteredClaims
	UserID     string `json:"userId,omitempty"`
	SessionID  string `json:"sid"`
	TokenType  string `json:"typ,omitempty"`
	LegacyType string `json:"type,omitempty"`
}

type TokenVerifier struct {
	keys   SigningKeySource
	config VerifierConfig
}

func NewTokenVerifier(keys SigningKeySource, config VerifierConfig) (*TokenVerifier, error) {
	if keys == nil {
		return nil, errors.New("signing key source is required")
	}
	if strings.TrimSpace(config.Issuer) == "" {
		return nil, errors.New("JWT issuer is required")
	}
	if len(config.Audiences) == 0 {
		return nil, errors.New("JWT audience is required")
	}
	for _, audience := range config.Audiences {
		if strings.TrimSpace(audience) == "" {
			return nil, errors.New("JWT audience must not be blank")
		}
	}
	if config.Leeway < 0 {
		return nil, errors.New("JWT leeway must not be negative")
	}
	if config.LegacyHS256Enabled && len(config.LegacyHS256Secret) < 32 {
		return nil, errors.New("legacy HS256 secret must contain at least 32 bytes")
	}
	return &TokenVerifier{keys: keys, config: config}, nil
}

func (verifier *TokenVerifier) Verify(ctx context.Context, rawToken string) (Principal, error) {
	validMethods := []string{"RS256", "ES256"}
	if verifier.config.LegacyHS256Enabled {
		validMethods = append(validMethods, "HS256")
	}

	claims := &accessTokenClaims{}
	parserOptions := []jwt.ParserOption{
		jwt.WithValidMethods(validMethods),
		jwt.WithIssuer(verifier.config.Issuer),
		jwt.WithExpirationRequired(),
		jwt.WithIssuedAt(),
		jwt.WithLeeway(verifier.config.Leeway),
	}
	parser := jwt.NewParser(parserOptions...)

	token, err := parser.ParseWithClaims(rawToken, claims, func(token *jwt.Token) (any, error) {
		algorithm := token.Method.Alg()
		if algorithm == "HS256" {
			if !verifier.config.LegacyHS256Enabled {
				return nil, fmt.Errorf("%w: legacy algorithm disabled", ErrTokenInvalid)
			}
			return verifier.config.LegacyHS256Secret, nil
		}
		keyID, _ := token.Header["kid"].(string)
		return verifier.keys.Key(ctx, strings.TrimSpace(keyID), algorithm)
	})
	if err != nil {
		switch {
		case errors.Is(err, jwt.ErrTokenExpired):
			return Principal{}, ErrTokenExpired
		case errors.Is(err, ErrSigningKeysUnavailable):
			return Principal{}, ErrAuthAuthorityUnready
		default:
			return Principal{}, ErrTokenInvalid
		}
	}
	if token == nil || !token.Valid {
		return Principal{}, ErrTokenInvalid
	}
	if !verifier.hasAcceptedAudience(claims.Audience) {
		return Principal{}, ErrTokenInvalid
	}

	return verifier.principalFromClaims(claims)
}

func (verifier *TokenVerifier) hasAcceptedAudience(tokenAudiences jwt.ClaimStrings) bool {
	for _, tokenAudience := range tokenAudiences {
		for _, expectedAudience := range verifier.config.Audiences {
			if tokenAudience == expectedAudience {
				return true
			}
		}
	}
	return false
}

func (verifier *TokenVerifier) principalFromClaims(claims *accessTokenClaims) (Principal, error) {
	tokenType := strings.TrimSpace(claims.TokenType)
	legacyType := strings.TrimSpace(claims.LegacyType)
	if tokenType == "" {
		tokenType = legacyType
	}
	if tokenType != "access" || (legacyType != "" && legacyType != "access") {
		return Principal{}, ErrTokenInvalid
	}

	subject, err := uuid.Parse(strings.TrimSpace(claims.Subject))
	if err != nil || subject == uuid.Nil {
		return Principal{}, ErrTokenInvalid
	}
	if claims.UserID != "" {
		compatibilityID, err := uuid.Parse(strings.TrimSpace(claims.UserID))
		if err != nil || compatibilityID != subject {
			return Principal{}, ErrTokenInvalid
		}
	}
	if claims.IssuedAt == nil || claims.ExpiresAt == nil || claims.IssuedAt.Time.IsZero() || claims.ExpiresAt.Time.IsZero() {
		return Principal{}, ErrTokenInvalid
	}
	if !claims.ExpiresAt.Time.After(claims.IssuedAt.Time) {
		return Principal{}, ErrTokenInvalid
	}
	if strings.TrimSpace(claims.SessionID) == "" || len(claims.SessionID) > 128 {
		return Principal{}, ErrTokenInvalid
	}
	if strings.TrimSpace(claims.ID) == "" || len(claims.ID) > 128 {
		return Principal{}, ErrTokenInvalid
	}

	return Principal{
		Subject:   subject,
		SessionID: claims.SessionID,
		TokenID:   claims.ID,
		IssuedAt:  claims.IssuedAt.Time.UTC(),
		ExpiresAt: claims.ExpiresAt.Time.UTC(),
	}, nil
}
