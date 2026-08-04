package auth

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type ServicePrincipal struct {
	ServiceKey string
	TokenID    string
	Scopes     []string
}

type servicePrincipalContextKey struct{}

func ServicePrincipalFromContext(ctx context.Context) (ServicePrincipal, bool) {
	principal, ok := ctx.Value(servicePrincipalContextKey{}).(ServicePrincipal)
	return principal, ok && principal.ServiceKey != ""
}

type serviceTokenClaims struct {
	jwt.RegisteredClaims
	ClientID   string   `json:"client_id"`
	TokenType  string   `json:"typ"`
	LegacyType string   `json:"type"`
	Scopes     []string `json:"scopes"`
	Scope      string   `json:"scope"`
}

type ServiceTokenAuthenticator struct {
	keys          SigningKeySource
	issuer        string
	audience      string
	requiredScope string
	leeway        time.Duration
}

func NewServiceTokenAuthenticator(keys SigningKeySource, issuer, audience, requiredScope string) (*ServiceTokenAuthenticator, error) {
	if keys == nil || strings.TrimSpace(issuer) == "" || strings.TrimSpace(audience) == "" || strings.TrimSpace(requiredScope) == "" {
		return nil, errors.New("service-token JWKS, issuer, audience and scope are required")
	}
	return &ServiceTokenAuthenticator{keys: keys, issuer: strings.TrimSpace(issuer), audience: strings.TrimSpace(audience), requiredScope: strings.TrimSpace(requiredScope), leeway: 30 * time.Second}, nil
}

func (a *ServiceTokenAuthenticator) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		raw, err := readBearerToken(request.Header.Get("Authorization"))
		if err != nil {
			writeAuthError(writer, http.StatusUnauthorized, "SERVICE_TOKEN_REQUIRED", "valid service token is required")
			return
		}
		principal, err := a.verify(request.Context(), raw)
		if err != nil {
			writeAuthError(writer, http.StatusUnauthorized, "INVALID_SERVICE_TOKEN", "service token is invalid")
			return
		}
		if !containsString(principal.Scopes, a.requiredScope) {
			writeAuthError(writer, http.StatusForbidden, "SERVICE_SCOPE_REQUIRED", "service token scope is insufficient")
			return
		}
		ctx := context.WithValue(request.Context(), servicePrincipalContextKey{}, principal)
		next.ServeHTTP(writer, request.WithContext(ctx))
	})
}

func (a *ServiceTokenAuthenticator) verify(ctx context.Context, raw string) (ServicePrincipal, error) {
	claims := &serviceTokenClaims{}
	token, err := jwt.NewParser(jwt.WithValidMethods([]string{"RS256", "ES256"}), jwt.WithIssuer(a.issuer), jwt.WithAudience(a.audience), jwt.WithExpirationRequired(), jwt.WithIssuedAt(), jwt.WithLeeway(a.leeway)).ParseWithClaims(raw, claims, func(token *jwt.Token) (any, error) {
		kid, _ := token.Header["kid"].(string)
		return a.keys.Key(ctx, strings.TrimSpace(kid), token.Method.Alg())
	})
	tokenType := strings.TrimSpace(claims.TokenType)
	if tokenType == "" {
		tokenType = strings.TrimSpace(claims.LegacyType)
	}
	if err != nil || token == nil || !token.Valid || tokenType != "service" || (claims.LegacyType != "" && claims.LegacyType != "service") || strings.TrimSpace(claims.ClientID) == "" || strings.TrimSpace(claims.ID) == "" {
		return ServicePrincipal{}, fmt.Errorf("invalid service token")
	}
	scopes := claims.Scopes
	if len(scopes) == 0 {
		scopes = strings.Fields(claims.Scope)
	}
	return ServicePrincipal{ServiceKey: strings.TrimSpace(claims.ClientID), TokenID: claims.ID, Scopes: scopes}, nil
}

func containsString(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}

type DemoServiceAuthenticator struct{ Token string }

func (a DemoServiceAuthenticator) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		raw, err := readBearerToken(request.Header.Get("Authorization"))
		if err != nil || a.Token == "" || raw != a.Token {
			writeAuthError(writer, http.StatusUnauthorized, "INVALID_SERVICE_TOKEN", "service token is invalid")
			return
		}
		ctx := context.WithValue(request.Context(), servicePrincipalContextKey{}, ServicePrincipal{ServiceKey: "chat-admin-service", TokenID: "demo", Scopes: []string{"cloud.quota.review"}})
		next.ServeHTTP(writer, request.WithContext(ctx))
	})
}
