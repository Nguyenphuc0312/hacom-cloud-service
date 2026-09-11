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
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"golang.org/x/sync/singleflight"
)

const maxDirectoryResponseBytes = 1 << 20

var ErrDirectoryUnavailable = errors.New("Auth user directory is unavailable")

type UserIdentity struct {
	ID          uuid.UUID
	Username    *string
	DisplayName *string
	Email       *string
}

type DirectoryClientConfig struct {
	ServiceTokenURL string
	BatchResolveURL string
	ClientID        string
	ClientSecret    string
	Audience        string
	Scopes          []string
}

type DirectoryClient struct {
	config     DirectoryClientConfig
	httpClient *http.Client
	now        func() time.Time

	mu    sync.Mutex
	token cachedServiceToken
	group singleflight.Group
}

func NewDirectoryClient(config DirectoryClientConfig, httpClient *http.Client) (*DirectoryClient, error) {
	if httpClient == nil {
		return nil, errors.New("Auth directory HTTP client is required")
	}
	if strings.TrimSpace(config.ClientID) == "" || config.ClientSecret == "" || strings.TrimSpace(config.Audience) == "" {
		return nil, errors.New("Auth directory service credentials and audience are required")
	}
	authorityOrigin := ""
	for _, endpoint := range []struct {
		name string
		raw  string
	}{
		{name: "service token URL", raw: config.ServiceTokenURL},
		{name: "batch resolve URL", raw: config.BatchResolveURL},
	} {
		parsed, err := url.Parse(endpoint.raw)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
			return nil, fmt.Errorf("%s must be an absolute http or https URL", endpoint.name)
		}
		origin := parsed.Scheme + "://" + parsed.Host
		if authorityOrigin == "" {
			authorityOrigin = origin
		} else if origin != authorityOrigin {
			return nil, errors.New("Auth directory endpoints must use the same origin")
		}
	}

	config.ClientID = strings.TrimSpace(config.ClientID)
	config.Audience = strings.TrimSpace(config.Audience)
	config.Scopes = normalizeStrings(config.Scopes)
	clientCopy := *httpClient
	clientCopy.CheckRedirect = func(request *http.Request, via []*http.Request) error {
		if len(via) >= 3 {
			return errors.New("too many Auth directory redirects")
		}
		if len(via) == 0 || request.URL.Host != via[0].URL.Host || request.URL.Scheme != via[0].URL.Scheme {
			return errors.New("cross-origin Auth directory redirect is not allowed")
		}
		return nil
	}
	return &DirectoryClient{config: config, httpClient: &clientCopy, now: time.Now}, nil
}

func (client *DirectoryClient) ResolveUsers(ctx context.Context, userIDs []uuid.UUID) (map[uuid.UUID]UserIdentity, error) {
	uniqueIDs := make([]uuid.UUID, 0, len(userIDs))
	seen := make(map[uuid.UUID]struct{}, len(userIDs))
	for _, id := range userIDs {
		if id == uuid.Nil {
			continue
		}
		if _, exists := seen[id]; exists {
			continue
		}
		seen[id] = struct{}{}
		uniqueIDs = append(uniqueIDs, id)
	}
	if len(uniqueIDs) == 0 {
		return map[uuid.UUID]UserIdentity{}, nil
	}

	userIDStrings := make([]string, 0, len(uniqueIDs))
	for _, id := range uniqueIDs {
		userIDStrings = append(userIDStrings, id.String())
	}
	var envelope struct {
		Data struct {
			Users []struct {
				ID          string  `json:"id"`
				Username    *string `json:"username"`
				DisplayName *string `json:"displayName"`
				Email       *string `json:"email"`
			} `json:"users"`
		} `json:"data"`
	}
	if err := client.authorizedJSON(ctx, http.MethodPost, client.config.BatchResolveURL, map[string]any{"userIds": userIDStrings}, &envelope); err != nil {
		return nil, err
	}

	result := make(map[uuid.UUID]UserIdentity, len(envelope.Data.Users))
	for _, user := range envelope.Data.Users {
		id, err := uuid.Parse(strings.TrimSpace(user.ID))
		if err != nil || id == uuid.Nil {
			continue
		}
		result[id] = UserIdentity{ID: id, Username: user.Username, DisplayName: user.DisplayName, Email: user.Email}
	}
	return result, nil
}

func (client *DirectoryClient) authorizedJSON(ctx context.Context, method, endpoint string, body any, target any) error {
	for attempt := 0; attempt < 2; attempt++ {
		token, err := client.serviceToken(ctx)
		if err != nil {
			return ErrDirectoryUnavailable
		}
		status, err := client.doJSON(ctx, method, endpoint, body, token, target)
		if err == nil {
			return nil
		}
		if status != http.StatusUnauthorized || attempt != 0 {
			return ErrDirectoryUnavailable
		}
		client.invalidateToken(token)
	}
	return ErrDirectoryUnavailable
}

func (client *DirectoryClient) serviceToken(ctx context.Context) (string, error) {
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
			return "", ErrDirectoryUnavailable
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

func (client *DirectoryClient) invalidateToken(token string) {
	client.mu.Lock()
	defer client.mu.Unlock()
	if client.token.value == token {
		client.token = cachedServiceToken{}
		client.group.Forget("service-token")
	}
}

func (client *DirectoryClient) doJSON(ctx context.Context, method, endpoint string, body any, bearer string, target any) (int, error) {
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
	data, err := io.ReadAll(io.LimitReader(response.Body, maxDirectoryResponseBytes+1))
	if err != nil || len(data) > maxDirectoryResponseBytes {
		return response.StatusCode, ErrDirectoryUnavailable
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return response.StatusCode, ErrDirectoryUnavailable
	}
	if err := json.Unmarshal(data, target); err != nil {
		return response.StatusCode, ErrDirectoryUnavailable
	}
	return response.StatusCode, nil
}
