package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"time"
)

// HTTPRevocationChecker delegates session/account state to chat-auth-service.
// Cloud never receives or stores Auth private keys or Auth database records.
type HTTPRevocationChecker struct {
	URL          string
	Client       *http.Client
	ServiceToken string
}

func (c HTTPRevocationChecker) Check(ctx context.Context, claims Claims) error {
	if c.URL == "" {
		return ErrAuthUnavailable
	}
	if c.Client == nil {
		c.Client = &http.Client{Timeout: 3 * time.Second}
	}
	payload := map[string]any{
		"sub":               claims.RegisteredClaims.Subject,
		"userId":            claims.UserID,
		"sid":               claims.SessionID,
		"jti":               claims.RegisteredClaims.ID,
		"iat":               claims.RegisteredClaims.IssuedAt,
		"tokenVersion":      claims.TokenVersion,
		"permissionVersion": claims.PermissionVersion,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return ErrAuthUnavailable
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.URL, bytes.NewReader(body))
	if err != nil {
		return ErrAuthUnavailable
	}
	req.Header.Set("Content-Type", "application/json")
	if c.ServiceToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.ServiceToken)
	}
	resp, err := c.Client.Do(req)
	if err != nil {
		return ErrAuthUnavailable
	}
	defer resp.Body.Close()
	switch resp.StatusCode {
	case http.StatusOK:
		var result struct {
			Active  *bool `json:"active"`
			Revoked bool  `json:"revoked"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			return ErrAuthUnavailable
		}
		if result.Revoked || (result.Active != nil && !*result.Active) {
			return ErrTokenRevoked
		}
		return nil
	case http.StatusNoContent:
		return nil
	case http.StatusUnauthorized, http.StatusForbidden, http.StatusGone:
		return ErrTokenRevoked
	default:
		return ErrAuthUnavailable
	}
}

var _ RevocationChecker = HTTPRevocationChecker{}
