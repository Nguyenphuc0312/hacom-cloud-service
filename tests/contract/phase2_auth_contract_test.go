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

func TestTrashOpenAPIAndPostmanContract(t *testing.T) {
	root := repositoryRoot(t)
	openAPI := readFile(t, filepath.Join(root, "docs", "openapi", "phase2-cloud-auth.openapi.yaml"))
	for _, required := range []string{
		"/api/v1/cloud/items/{itemId}/trash:",
		"/api/v1/cloud/items/{itemId}/restore:",
		"/api/v1/cloud/trash:",
		"operationId: permanentlyDeleteCloudItem",
		"activeBytes:",
		"trashBytes:",
		"INVALID_ITEM_STATE",
		"RESTORE_EXPIRED",
		"DELETE_PENDING",
	} {
		if !strings.Contains(openAPI, required) {
			t.Errorf("Trash OpenAPI contract is missing %q", required)
		}
	}

	postmanPath := filepath.Join(root, "tests", "postman", "Hacom-Cloud-Phase-2-Trash.postman_collection.json")
	var collection map[string]any
	if err := json.Unmarshal([]byte(readFile(t, postmanPath)), &collection); err != nil {
		t.Fatalf("Trash Postman collection is invalid JSON: %v", err)
	}
	items, ok := collection["item"].([]any)
	if !ok || len(items) < 5 {
		t.Fatalf("Trash Postman collection has %d requests, want at least 5", len(items))
	}
}

func TestPhase3SearchOpenAPIContract(t *testing.T) {
	root := repositoryRoot(t)
	openAPI := readFile(t, filepath.Join(root, "docs", "openapi", "phase2-cloud-auth.openapi.yaml"))
	for _, required := range []string{
		"operationId: listCloudItems",
		"operationId: listCloudTrash",
		"SearchQuery:",
		"ItemTypeFilter:",
		"CreatedFrom:",
		"CreatedTo:",
		"minLength: 3",
		"maxLength: 200",
	} {
		if !strings.Contains(openAPI, required) {
			t.Errorf("Phase 3 search OpenAPI contract is missing %q", required)
		}
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
		"AUTH_SERVICE_TOKEN_URL=",
		"AUTH_SERVICE_CLIENT_ID=",
		"AUTH_SERVICE_CLIENT_SECRET=",
		"AUTH_SERVICE_TOKEN_AUDIENCE=",
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

	t.Run("inactive account is forbidden", func(t *testing.T) {
		response := doRequest(t, client, configuration.baseURL, http.MethodGet,
			"/api/v1/cloud/quota", configuration.inactiveToken, nil, nil)
		defer response.Body.Close()
		if response.StatusCode != http.StatusForbidden {
			t.Fatalf("status = %d, want 403", response.StatusCode)
		}
		assertErrorCode(t, response.Body, "ACCOUNT_NOT_ACTIVE")
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
	baseURL       string
	userAToken    string
	userBToken    string
	expiredToken  string
	refreshToken  string
	revokedToken  string
	inactiveToken string
}

func loadLiveConfiguration(t *testing.T) liveConfiguration {
	t.Helper()
	required := strings.EqualFold(os.Getenv("PHASE2_CONTRACT_REQUIRED"), "true")
	values := []struct {
		key   string
		value string
	}{
		{key: "PHASE2_BASE_URL", value: strings.TrimRight(os.Getenv("PHASE2_BASE_URL"), "/")},
		{key: "PHASE2_ACCESS_TOKEN_USER_A", value: os.Getenv("PHASE2_ACCESS_TOKEN_USER_A")},
		{key: "PHASE2_ACCESS_TOKEN_USER_B", value: os.Getenv("PHASE2_ACCESS_TOKEN_USER_B")},
		{key: "PHASE2_EXPIRED_TOKEN", value: os.Getenv("PHASE2_EXPIRED_TOKEN")},
		{key: "PHASE2_REFRESH_TOKEN", value: os.Getenv("PHASE2_REFRESH_TOKEN")},
		{key: "PHASE2_REVOKED_TOKEN", value: os.Getenv("PHASE2_REVOKED_TOKEN")},
		{key: "PHASE2_INACTIVE_TOKEN", value: os.Getenv("PHASE2_INACTIVE_TOKEN")},
	}
	valueByKey := make(map[string]string, len(values))
	var missing []string
	for _, item := range values {
		valueByKey[item.key] = item.value
		if item.value == "" {
			missing = append(missing, item.key)
		}
	}
	if len(missing) > 0 {
		if required {
			t.Fatalf("live contract configuration is incomplete; missing %s", strings.Join(missing, ", "))
		}
		t.Skip("live Auth contract requires environment-issued test tokens")
	}
	return liveConfiguration{
		baseURL: valueByKey["PHASE2_BASE_URL"], userAToken: valueByKey["PHASE2_ACCESS_TOKEN_USER_A"],
		userBToken: valueByKey["PHASE2_ACCESS_TOKEN_USER_B"], expiredToken: valueByKey["PHASE2_EXPIRED_TOKEN"],
		refreshToken: valueByKey["PHASE2_REFRESH_TOKEN"], revokedToken: valueByKey["PHASE2_REVOKED_TOKEN"],
		inactiveToken: valueByKey["PHASE2_INACTIVE_TOKEN"],
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
