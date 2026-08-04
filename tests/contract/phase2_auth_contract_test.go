package contract_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

const (
	requestIDHeader = "X-Request-ID"
	demoUserHeader  = "X-Demo-User-ID"
)

type errorEnvelope struct {
	Error struct {
		Code string `json:"code"`
	} `json:"error"`
}

func TestGatewayContract(t *testing.T) {
	root := repositoryRoot(t)
	content := readFile(t, filepath.Join(root, "deployments", "nginx", "cloud-api.conf.example"))
	required := []string{
		"limit_req_zone $binary_remote_addr",
		"location ^~ /cloud-api/",
		"rewrite ^/cloud-api/(.*)$ /$1 break;",
		"proxy_set_header Authorization $http_authorization;",
		"proxy_set_header X-Demo-User-ID \"\";",
		"proxy_set_header X-Request-ID $request_id;",
		"limit_req zone=hacom_cloud_api_per_ip",
	}
	for _, value := range required {
		if !strings.Contains(content, value) {
			t.Errorf("gateway contract is missing %q", value)
		}
	}
	for _, forbidden := range []string{
		"Access-Control-Allow-Origin *",
		"proxy_set_header X-Demo-User-ID $http_x_demo_user_id",
	} {
		if strings.Contains(content, forbidden) {
			t.Errorf("gateway contract contains unsafe directive %q", forbidden)
		}
	}
}

func TestOpenAPIContract(t *testing.T) {
	root := repositoryRoot(t)
	content := readFile(t, filepath.Join(root, "docs", "openapi", "phase2-cloud-auth.openapi.yaml"))
	required := []string{
		"url: /cloud-api",
		"scheme: bearer",
		"bearerFormat: JWT",
		"AUTH_REQUIRED",
		"INVALID_ACCESS_TOKEN",
		"SESSION_REVOKED",
		"ACCOUNT_NOT_ACTIVE",
		"AUTH_AUTHORITY_UNAVAILABLE",
		"X-Request-ID",
	}
	for _, value := range required {
		if !strings.Contains(content, value) {
			t.Errorf("OpenAPI contract is missing %q", value)
		}
	}
	if strings.Contains(content, "X-Demo-User-ID") {
		t.Fatal("production OpenAPI contract must not advertise demo identity")
	}
}

func TestPhase2AuthContractConfiguration(t *testing.T) {
	root := repositoryRoot(t)
	content := readFile(t, filepath.Join(root, ".env.example"))
	for _, key := range []string{
		"AUTH_MODE=demo",
		"AUTH_ISSUER=chat-service",
		"AUTH_AUDIENCE=chat-service",
		"AUTH_JWKS_URL=",
		"AUTH_VERIFICATION_CONTRACT_URL=",
		"AUTH_ACCOUNT_STATE_URL=",
		"AUTH_SERVICE_CLIENT_ID=",
		"AUTH_SERVICE_CLIENT_SECRET=",
	} {
		if !strings.Contains(content, key) {
			t.Errorf(".env.example is missing %q", key)
		}
	}
}

func TestPhase2AuthHTTPContract(t *testing.T) {
	configuration := loadLiveConfiguration(t)
	client := &http.Client{Timeout: 10 * time.Second}

	t.Run("valid access token and spoofed headers", func(t *testing.T) {
		response := doRequest(t, client, configuration.baseURL, http.MethodGet,
			"/api/v1/cloud/quota", configuration.userAToken, nil, map[string]string{
				demoUserHeader:        "00000000-0000-4000-8000-000000000099",
				"X-Forwarded-User-ID": "00000000-0000-4000-8000-000000000099",
				requestIDHeader:       "attacker-controlled-request-id",
			})
		defer response.Body.Close()
		if response.StatusCode != http.StatusOK {
			t.Fatalf("valid access token status = %d, want 200", response.StatusCode)
		}
		requestID := response.Header.Get(requestIDHeader)
		if requestID == "" || requestID == "attacker-controlled-request-id" || len(requestID) > 128 {
			t.Fatalf("unsafe response request ID %q", requestID)
		}
	})

	t.Run("stable authentication failures", func(t *testing.T) {
		tests := []struct {
			name     string
			token    string
			wantCode string
		}{
			{name: "missing", wantCode: "AUTH_REQUIRED"},
			{name: "expired", token: configuration.expiredToken, wantCode: "INVALID_ACCESS_TOKEN"},
			{name: "refresh", token: configuration.refreshToken, wantCode: "INVALID_ACCESS_TOKEN"},
			{name: "revoked", token: configuration.revokedToken, wantCode: "SESSION_REVOKED"},
		}
		for _, test := range tests {
			t.Run(test.name, func(t *testing.T) {
				response := doRequest(t, client, configuration.baseURL, http.MethodGet,
					"/api/v1/cloud/quota", test.token, nil, nil)
				defer response.Body.Close()
				if response.StatusCode != http.StatusUnauthorized {
					t.Fatalf("status = %d, want 401", response.StatusCode)
				}
				assertErrorCode(t, response.Body, test.wantCode)
				if !strings.HasPrefix(response.Header.Get("WWW-Authenticate"), "Bearer") {
					t.Fatalf("WWW-Authenticate = %q, want Bearer", response.Header.Get("WWW-Authenticate"))
				}
			})
		}
	})

	t.Run("owner comes only from token subject", func(t *testing.T) {
		body := bytes.NewBufferString(fmt.Sprintf(`{"content":"phase2-owner-contract-%d"}`, time.Now().UnixNano()))
		created := doRequest(t, client, configuration.baseURL, http.MethodPost,
			"/api/v1/cloud/texts", configuration.userAToken, body, map[string]string{
				"Content-Type": "application/json",
				demoUserHeader: "00000000-0000-4000-8000-000000000099",
			})
		defer created.Body.Close()
		if created.StatusCode != http.StatusCreated {
			t.Fatalf("create status = %d, want 201", created.StatusCode)
		}
		var item struct {
			ID string `json:"id"`
		}
		if err := json.NewDecoder(created.Body).Decode(&item); err != nil || item.ID == "" {
			t.Fatalf("decode created item: %v", err)
		}

		otherOwner := doRequest(t, client, configuration.baseURL, http.MethodGet,
			"/api/v1/cloud/items/"+item.ID, configuration.userBToken, nil,
			map[string]string{demoUserHeader: "00000000-0000-4000-8000-000000000099"})
		defer otherOwner.Body.Close()
		if otherOwner.StatusCode != http.StatusNotFound {
			t.Fatalf("cross-owner status = %d, want 404", otherOwner.StatusCode)
		}
		assertErrorCode(t, otherOwner.Body, "ITEM_NOT_FOUND")
	})

	t.Run("untrusted origin is not granted credentialed CORS", func(t *testing.T) {
		response := doRequest(t, client, configuration.baseURL, http.MethodGet,
			"/api/v1/cloud/quota", configuration.userAToken, nil,
			map[string]string{"Origin": "https://attacker.invalid"})
		defer response.Body.Close()
		allowOrigin := response.Header.Get("Access-Control-Allow-Origin")
		if allowOrigin == "*" || allowOrigin == "https://attacker.invalid" {
			t.Fatalf("untrusted CORS origin was granted: %q", allowOrigin)
		}
	})
}

type liveConfiguration struct {
	baseURL      string
	userAToken   string
	userBToken   string
	expiredToken string
	refreshToken string
	revokedToken string
}

func loadLiveConfiguration(t *testing.T) liveConfiguration {
	t.Helper()
	required := strings.EqualFold(os.Getenv("PHASE2_CONTRACT_REQUIRED"), "true")
	values := map[string]string{
		"PHASE2_BASE_URL":            strings.TrimRight(os.Getenv("PHASE2_BASE_URL"), "/"),
		"PHASE2_ACCESS_TOKEN_USER_A": os.Getenv("PHASE2_ACCESS_TOKEN_USER_A"),
		"PHASE2_ACCESS_TOKEN_USER_B": os.Getenv("PHASE2_ACCESS_TOKEN_USER_B"),
		"PHASE2_EXPIRED_TOKEN":       os.Getenv("PHASE2_EXPIRED_TOKEN"),
		"PHASE2_REFRESH_TOKEN":       os.Getenv("PHASE2_REFRESH_TOKEN"),
		"PHASE2_REVOKED_TOKEN":       os.Getenv("PHASE2_REVOKED_TOKEN"),
	}
	var missing []string
	for key, value := range values {
		if value == "" {
			missing = append(missing, key)
		}
	}
	if len(missing) > 0 {
		if required {
			t.Fatalf("live contract configuration is incomplete; missing %s", strings.Join(missing, ", "))
		}
		t.Skip("live Auth contract requires environment-issued test tokens")
	}
	return liveConfiguration{
		baseURL: values["PHASE2_BASE_URL"], userAToken: values["PHASE2_ACCESS_TOKEN_USER_A"],
		userBToken: values["PHASE2_ACCESS_TOKEN_USER_B"], expiredToken: values["PHASE2_EXPIRED_TOKEN"],
		refreshToken: values["PHASE2_REFRESH_TOKEN"], revokedToken: values["PHASE2_REVOKED_TOKEN"],
	}
}

func doRequest(t *testing.T, client *http.Client, baseURL, method, path, token string, body io.Reader, headers map[string]string) *http.Response {
	t.Helper()
	request, err := http.NewRequest(method, baseURL+path, body)
	if err != nil {
		t.Fatal(err)
	}
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	for key, value := range headers {
		request.Header.Set(key, value)
	}
	response, err := client.Do(request)
	if err != nil {
		t.Fatalf("contract request %s %s failed: %v", method, path, err)
	}
	return response
}

func assertErrorCode(t *testing.T, body io.Reader, want string) {
	t.Helper()
	var envelope errorEnvelope
	if err := json.NewDecoder(io.LimitReader(body, 1<<20)).Decode(&envelope); err != nil {
		t.Fatalf("decode error envelope: %v", err)
	}
	if envelope.Error.Code != want {
		t.Fatalf("error code = %q, want %q", envelope.Error.Code, want)
	}
}

func repositoryRoot(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve contract test path")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(file), "..", ".."))
}

func readFile(t *testing.T, path string) string {
	t.Helper()
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(content)
}
