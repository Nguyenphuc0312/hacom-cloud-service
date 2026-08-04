package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"golang.org/x/sync/singleflight"
)

const maxAuthorityResponseBytes = 1 << 20

type AuthorityDecision uint8

const (
	AuthorityAllowed AuthorityDecision = iota
	AuthoritySessionRevoked
	AuthorityAccountNotActive
)

type AccountStateChecker interface {
	Check(ctx context.Context, principal Principal) (AuthorityDecision, error)
}

type AuthorityClientConfig struct {
	ServiceTokenURL         string
	AccountStateURL         string
	VerificationContractURL string
	ClientID                string
	ClientSecret            string
	Audience                string
	Scopes                  []string
	ExpectedJWKSURL         string
	ExpectedIssuer          string
	ExpectedAudiences       []string
}

type cachedServiceToken struct {
	value     string
	expiresAt time.Time
}

type AuthorityClient struct {
	config     AuthorityClientConfig
	httpClient *http.Client
	now        func() time.Time

	mu    sync.Mutex
	token cachedServiceToken
	group singleflight.Group
}

func NewAuthorityClient(config AuthorityClientConfig, httpClient *http.Client) (*AuthorityClient, error) {
	if httpClient == nil {
		return nil, errors.New("Auth authority HTTP client is required")
	}
	var authorityOrigin string
	for _, endpoint := range []struct {
		name   string
		rawURL string
	}{
		{name: "service token URL", rawURL: config.ServiceTokenURL},
		{name: "account-state URL", rawURL: config.AccountStateURL},
		{name: "verification contract URL", rawURL: config.VerificationContractURL},
	} {
		parsed, err := url.Parse(endpoint.rawURL)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
			return nil, fmt.Errorf("%s must be an absolute http or https URL", endpoint.name)
		}
		origin := parsed.Scheme + "://" + parsed.Host
		if authorityOrigin == "" {
			authorityOrigin = origin
		} else if origin != authorityOrigin {
			return nil, errors.New("Auth authority endpoints must use the same origin")
		}
	}
	if strings.TrimSpace(config.ClientID) == "" || config.ClientSecret == "" || strings.TrimSpace(config.Audience) == "" {
		return nil, errors.New("Auth service client credentials and audience are required")
	}
	if strings.TrimSpace(config.ExpectedJWKSURL) == "" || strings.TrimSpace(config.ExpectedIssuer) == "" || len(config.ExpectedAudiences) == 0 {
		return nil, errors.New("expected Auth verification contract is required")
	}
	config.ClientID = strings.TrimSpace(config.ClientID)
	config.Audience = strings.TrimSpace(config.Audience)
	config.Scopes = normalizeStrings(config.Scopes)
	config.ExpectedAudiences = normalizeStrings(config.ExpectedAudiences)
	if len(config.ExpectedAudiences) == 0 {
		return nil, errors.New("expected Auth audiences are required")
	}
	clientCopy := *httpClient
	clientCopy.CheckRedirect = func(request *http.Request, via []*http.Request) error {
		if len(via) >= 3 {
			return errors.New("too many Auth authority redirects")
		}
		if len(via) == 0 || request.URL.Host != via[0].URL.Host || request.URL.Scheme != via[0].URL.Scheme {
			return errors.New("cross-origin Auth authority redirect is not allowed")
		}
		return nil
	}
	return &AuthorityClient{config: config, httpClient: &clientCopy, now: time.Now}, nil
}

func normalizeStrings(values []string) []string {
	result := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

func (client *AuthorityClient) Check(ctx context.Context, principal Principal) (AuthorityDecision, error) {
	if principal.Subject == uuid.Nil || strings.TrimSpace(principal.SessionID) == "" {
		return AuthorityAllowed, ErrAuthAuthorityUnready
	}
	payload := struct {
		UserID        string `json:"userId"`
		AuthSessionID string `json:"authSessionId,omitempty"`
	}{UserID: principal.Subject.String(), AuthSessionID: principal.SessionID}

	var envelope struct {
		Data struct {
			Allowed      bool   `json:"allowed"`
			AccountState string `json:"accountState"`
			Status       string `json:"status"`
			Reason       string `json:"reason"`
		} `json:"data"`
	}
	if err := client.authorizedJSON(ctx, http.MethodPost, client.config.AccountStateURL, payload, &envelope); err != nil {
		return AuthorityAllowed, err
	}
	state := strings.ToUpper(strings.TrimSpace(envelope.Data.AccountState))
	status := strings.ToUpper(strings.TrimSpace(envelope.Data.Status))
	reason := strings.ToUpper(strings.TrimSpace(envelope.Data.Reason))
	if envelope.Data.Allowed {
		if state != "ACTIVE" || status != "ACTIVE" {
			return AuthorityAllowed, ErrAuthAuthorityUnready
		}
		return AuthorityAllowed, nil
	}
	if strings.HasPrefix(reason, "SESSION_") {
		return AuthoritySessionRevoked, nil
	}
	if state != status {
		return AuthorityAllowed, ErrAuthAuthorityUnready
	}
	switch state {
	case "ACCOUNT_CREATED", "INACTIVE", "OTP_PENDING", "PENDING_VERIFICATION", "PENDING_HR_LINK", "DISABLED", "LOCKED", "DEACTIVATED", "TOMBSTONED":
		return AuthorityAccountNotActive, nil
	default:
		return AuthorityAllowed, ErrAuthAuthorityUnready
	}
}

func (client *AuthorityClient) ValidateVerificationContract(ctx context.Context) error {
	var envelope struct {
		Data struct {
			JWKSURL          string          `json:"jwksUrl"`
			Issuer           string          `json:"issuer"`
			Audience         json.RawMessage `json:"audience"`
			Algorithms       []string        `json:"algorithms"`
			JWKSAvailable    bool            `json:"jwksAvailable"`
			VerificationMode string          `json:"verificationMode"`
		} `json:"data"`
	}
	if err := client.authorizedJSON(ctx, http.MethodGet, client.config.VerificationContractURL, nil, &envelope); err != nil {
		return err
	}
	audiences, err := decodeAudience(envelope.Data.Audience)
	if err != nil {
		return ErrAuthAuthorityUnready
	}
	if strings.TrimRight(envelope.Data.JWKSURL, "/") != strings.TrimRight(client.config.ExpectedJWKSURL, "/") ||
		envelope.Data.Issuer != client.config.ExpectedIssuer || !envelope.Data.JWKSAvailable ||
		!containsAll(audiences, client.config.ExpectedAudiences) ||
		(!slices.Contains(envelope.Data.Algorithms, "RS256") && !slices.Contains(envelope.Data.Algorithms, "ES256")) {
		return ErrAuthAuthorityUnready
	}
	return nil
}

func decodeAudience(raw json.RawMessage) ([]string, error) {
	var single string
	if err := json.Unmarshal(raw, &single); err == nil && strings.TrimSpace(single) != "" {
		return []string{strings.TrimSpace(single)}, nil
	}
	var multiple []string
	if err := json.Unmarshal(raw, &multiple); err != nil {
		return nil, err
	}
	multiple = normalizeStrings(multiple)
	if len(multiple) == 0 {
		return nil, errors.New("audience is empty")
	}
	return multiple, nil
}

func containsAll(contractAudiences, acceptedAudiences []string) bool {
	for _, value := range acceptedAudiences {
		if !slices.Contains(contractAudiences, value) {
			return false
		}
	}
	return true
}

func (client *AuthorityClient) authorizedJSON(ctx context.Context, method, endpoint string, body any, target any) error {
	for attempt := 0; attempt < 2; attempt++ {
		token, err := client.serviceToken(ctx)
		if err != nil {
			return ErrAuthAuthorityUnready
		}
		status, err := client.doJSON(ctx, method, endpoint, body, token, target)
		if err == nil {
			return nil
		}
		if status != http.StatusUnauthorized || attempt != 0 {
			return ErrAuthAuthorityUnready
		}
		client.invalidateToken(token)
	}
	return ErrAuthAuthorityUnready
}

func (client *AuthorityClient) serviceToken(ctx context.Context) (string, error) {
	client.mu.Lock()
	if client.token.value != "" && client.token.expiresAt.After(client.now()) {
		value := client.token.value
		client.mu.Unlock()
		return value, nil
	}
	client.mu.Unlock()

	resultChannel := client.group.DoChan("service-token", func() (any, error) {
		client.mu.Lock()
		if client.token.value != "" && client.token.expiresAt.After(client.now()) {
			value := client.token.value
			client.mu.Unlock()
			return value, nil
		}
		client.mu.Unlock()

		payload := struct {
			ClientID     string   `json:"clientId"`
			ClientSecret string   `json:"clientSecret"`
			Audience     string   `json:"audience"`
			Scopes       []string `json:"scopes"`
		}{client.config.ClientID, client.config.ClientSecret, client.config.Audience, client.config.Scopes}
		var envelope struct {
			Data struct {
				AccessToken string `json:"accessToken"`
				TokenType   string `json:"tokenType"`
				ExpiresIn   int64  `json:"expiresIn"`
			} `json:"data"`
		}
		status, err := client.doJSON(ctx, http.MethodPost, client.config.ServiceTokenURL, payload, "", &envelope)
		if err != nil || status != http.StatusOK || strings.TrimSpace(envelope.Data.AccessToken) == "" ||
			!strings.EqualFold(envelope.Data.TokenType, "Bearer") || envelope.Data.ExpiresIn <= 0 || envelope.Data.ExpiresIn > 86400 {
			return "", ErrAuthAuthorityUnready
		}
		ttl := time.Duration(envelope.Data.ExpiresIn) * time.Second
		skew := 30 * time.Second
		if ttl <= 2*skew {
			skew = ttl / 4
		}
		client.mu.Lock()
		client.token = cachedServiceToken{value: envelope.Data.AccessToken, expiresAt: client.now().Add(ttl - skew)}
		client.mu.Unlock()
		return envelope.Data.AccessToken, nil
	})
	select {
	case <-ctx.Done():
		return "", ctx.Err()
	case result := <-resultChannel:
		if result.Err != nil {
			return "", result.Err
		}
		return result.Val.(string), nil
	}
}

func (client *AuthorityClient) invalidateToken(token string) {
	client.mu.Lock()
	defer client.mu.Unlock()
	if client.token.value == token {
		client.token = cachedServiceToken{}
		client.group.Forget("service-token")
	}
}

func (client *AuthorityClient) doJSON(ctx context.Context, method, endpoint string, body any, bearer string, target any) (int, error) {
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return 0, err
		}
		reader = bytes.NewReader(encoded)
	}
	request, err := http.NewRequestWithContext(ctx, method, endpoint, reader)
	if err != nil {
		return 0, err
	}
	request.Header.Set("Accept", "application/json")
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	if bearer != "" {
		request.Header.Set("Authorization", "Bearer "+bearer)
	}
	response, err := client.httpClient.Do(request)
	if err != nil {
		return 0, err
	}
	defer response.Body.Close()
	limited := io.LimitReader(response.Body, maxAuthorityResponseBytes+1)
	data, err := io.ReadAll(limited)
	if err != nil || len(data) > maxAuthorityResponseBytes {
		return response.StatusCode, ErrAuthAuthorityUnready
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return response.StatusCode, ErrAuthAuthorityUnready
	}
	if err := json.Unmarshal(data, target); err != nil {
		return response.StatusCode, ErrAuthAuthorityUnready
	}
	return response.StatusCode, nil
}
