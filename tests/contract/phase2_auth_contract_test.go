package contract_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
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

func TestPhase3QuotaRequestOpenAPIContract(t *testing.T) {
	root := repositoryRoot(t)
	openAPI := readFile(t, filepath.Join(root, "docs", "openapi", "phase2-cloud-auth.openapi.yaml"))
	for _, required := range []string{
		"/api/v1/cloud/quota/requests:",
		"/api/v1/cloud/quota/requests/current:",
		"operationId: createCloudQuotaRequest",
		"operationId: getCurrentCloudQuotaRequest",
		"requestedQuotaBytes:",
		"format: int64",
		"INVALID_QUOTA_TIER",
		"QUOTA_REQUEST_PENDING",
		"QUOTA_REQUEST_NOT_FOUND",
	} {
		if !strings.Contains(openAPI, required) {
			t.Errorf("Phase 3 quota-request OpenAPI contract is missing %q", required)
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

	liveTemplate := readFile(t, filepath.Join(root, "tests", "env", "phase2-gate1.env.example"))
	for _, key := range []string{
		"PHASE2_BASE_URL=",
		"PHASE2_JWKS_URL=",
		"PHASE2_ACCESS_TOKEN_USER_A=",
		"PHASE2_ACCESS_TOKEN_USER_B=",
		"PHASE2_EXPIRED_TOKEN=",
		"PHASE2_REFRESH_TOKEN=",
		"PHASE2_REVOKED_TOKEN=",
		"PHASE2_INACTIVE_TOKEN=",
	} {
		if !strings.Contains(liveTemplate, key) {
			t.Errorf("Gate 1 live environment template is missing %q", key)
		}
	}
}

func TestPhase2AuthHTTPContract(t *testing.T) {
	configuration := loadLiveConfiguration(t)
	client := &http.Client{Timeout: 10 * time.Second}

	t.Run("JWKS publishes a usable public key", func(t *testing.T) {
		response := doRequest(t, client, configuration.jwksURL, http.MethodGet, "", "", nil, nil)
		defer response.Body.Close()
		if response.StatusCode != http.StatusOK {
			t.Fatalf("JWKS status = %d, want 200", response.StatusCode)
		}
		assertUsableJWKS(t, response.Body)
	})

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
			{name: "malformed", token: "not-a-jwt", wantCode: "INVALID_ACCESS_TOKEN"},
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

		sameOwner := doRequest(t, client, configuration.baseURL, http.MethodGet,
			"/api/v1/cloud/items/"+item.ID, configuration.userAToken, nil, nil)
		defer sameOwner.Body.Close()
		if sameOwner.StatusCode != http.StatusOK {
			t.Fatalf("same-owner status = %d, want 200", sameOwner.StatusCode)
		}

		otherOwner := doRequest(t, client, configuration.baseURL, http.MethodGet,
			"/api/v1/cloud/items/"+item.ID, configuration.userBToken, nil,
			map[string]string{demoUserHeader: "00000000-0000-4000-8000-000000000099"})
		defer otherOwner.Body.Close()
		if otherOwner.StatusCode != http.StatusNotFound {
			t.Fatalf("cross-owner status = %d, want 404", otherOwner.StatusCode)
		}
		assertErrorCode(t, otherOwner.Body, "ITEM_NOT_FOUND")

		body = bytes.NewBufferString(fmt.Sprintf(`{"content":"phase2-owner-b-contract-%d"}`, time.Now().UnixNano()))
		createdByB := doRequest(t, client, configuration.baseURL, http.MethodPost,
			"/api/v1/cloud/texts", configuration.userBToken, body, map[string]string{
				"Content-Type": "application/json",
				demoUserHeader: "00000000-0000-4000-8000-000000000099",
			})
		defer createdByB.Body.Close()
		if createdByB.StatusCode != http.StatusCreated {
			t.Fatalf("User B create status = %d, want 201", createdByB.StatusCode)
		}
		var itemB struct {
			ID string `json:"id"`
		}
		if err := json.NewDecoder(createdByB.Body).Decode(&itemB); err != nil || itemB.ID == "" {
			t.Fatalf("decode User B item: %v", err)
		}
		userBReadsOwn := doRequest(t, client, configuration.baseURL, http.MethodGet,
			"/api/v1/cloud/items/"+itemB.ID, configuration.userBToken, nil, nil)
		defer userBReadsOwn.Body.Close()
		if userBReadsOwn.StatusCode != http.StatusOK {
			t.Fatalf("User B reading own item status = %d, want 200", userBReadsOwn.StatusCode)
		}
		userAReadsB := doRequest(t, client, configuration.baseURL, http.MethodGet,
			"/api/v1/cloud/items/"+itemB.ID, configuration.userAToken, nil, nil)
		defer userAReadsB.Body.Close()
		if userAReadsB.StatusCode != http.StatusNotFound {
			t.Fatalf("User A reading User B item status = %d, want 404", userAReadsB.StatusCode)
		}
		assertErrorCode(t, userAReadsB.Body, "ITEM_NOT_FOUND")
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
	jwksURL       string
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
		{key: "PHASE2_JWKS_URL", value: os.Getenv("PHASE2_JWKS_URL")},
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
	for _, key := range []string{"PHASE2_BASE_URL", "PHASE2_JWKS_URL"} {
		parsed, err := url.ParseRequestURI(valueByKey[key])
		if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
			t.Fatalf("%s must be an absolute HTTP(S) URL", key)
		}
	}
	if valueByKey["PHASE2_ACCESS_TOKEN_USER_A"] == valueByKey["PHASE2_ACCESS_TOKEN_USER_B"] {
		t.Fatal("User A and User B tokens must represent different users")
	}
	return liveConfiguration{
		baseURL: valueByKey["PHASE2_BASE_URL"], jwksURL: valueByKey["PHASE2_JWKS_URL"], userAToken: valueByKey["PHASE2_ACCESS_TOKEN_USER_A"],
		userBToken: valueByKey["PHASE2_ACCESS_TOKEN_USER_B"], expiredToken: valueByKey["PHASE2_EXPIRED_TOKEN"],
		refreshToken: valueByKey["PHASE2_REFRESH_TOKEN"], revokedToken: valueByKey["PHASE2_REVOKED_TOKEN"],
		inactiveToken: valueByKey["PHASE2_INACTIVE_TOKEN"],
	}
}

func TestPhase2JWKSValidation(t *testing.T) {
	t.Run("accepts public RSA and EC keys", func(t *testing.T) {
		assertUsableJWKS(t, strings.NewReader(`{"keys":[{"kid":"rsa-1","kty":"RSA","alg":"RS256","n":"abc","e":"AQAB"},{"kid":"ec-1","kty":"EC","alg":"ES256","x":"abc","y":"def"}]}`))
	})

	for name, document := range map[string]string{
		"empty key set":      `{"keys":[]}`,
		"private key leaked": `{"keys":[{"kid":"rsa-1","kty":"RSA","alg":"RS256","n":"abc","e":"AQAB","d":"secret"}]}`,
		"unsupported key":    `{"keys":[{"kid":"oct-1","kty":"oct","alg":"HS256"}]}`,
	} {
		t.Run(name, func(t *testing.T) {
			if validateJWKS(strings.NewReader(document)) == nil {
				t.Fatalf("JWKS %s unexpectedly passed", name)
			}
		})
	}
}

func assertUsableJWKS(t *testing.T, body io.Reader) {
	t.Helper()
	if err := validateJWKS(io.LimitReader(body, 1<<20)); err != nil {
		t.Fatal(err)
	}
}

func validateJWKS(body io.Reader) error {
	var document struct {
		Keys []struct {
			KeyID string `json:"kid"`
			Type  string `json:"kty"`
			Alg   string `json:"alg"`
			N     string `json:"n"`
			E     string `json:"e"`
			X     string `json:"x"`
			Y     string `json:"y"`
			D     string `json:"d"`
			P     string `json:"p"`
			Q     string `json:"q"`
			DP    string `json:"dp"`
			DQ    string `json:"dq"`
			QI    string `json:"qi"`
		} `json:"keys"`
	}
	if err := json.NewDecoder(body).Decode(&document); err != nil {
		return fmt.Errorf("decode JWKS: %w", err)
	}
	usable := 0
	for _, key := range document.Keys {
		if key.D != "" || key.P != "" || key.Q != "" || key.DP != "" || key.DQ != "" || key.QI != "" {
			return fmt.Errorf("JWKS key %q exposes private key material", key.KeyID)
		}
		if key.KeyID == "" {
			continue
		}
		switch key.Type {
		case "RSA":
			if (key.Alg == "" || key.Alg == "RS256") && key.N != "" && key.E != "" {
				usable++
			}
		case "EC":
			if (key.Alg == "" || key.Alg == "ES256") && key.X != "" && key.Y != "" {
				usable++
			}
		}
	}
	if usable == 0 {
		return fmt.Errorf("JWKS contains no usable RS256 or ES256 public key")
	}
	return nil
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
