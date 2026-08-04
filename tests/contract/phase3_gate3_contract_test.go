package contract

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPhase3Gate3CrossServiceContract(t *testing.T) {
	root := filepath.Join("..", "..")
	postman, err := os.ReadFile(filepath.Join(root, "tests", "postman", "Hacom-Cloud-Phase-3-Gate-3.postman_collection.json"))
	if err != nil {
		t.Fatal(err)
	}
	content := string(postman)
	for _, expected := range []string{"userToken", "adminToken", "X-Request-ID", "Idempotency-Key", "/admin/cloud/quota-requests/", "/api/v1/cloud/quota"} {
		if !strings.Contains(content, expected) {
			t.Fatalf("Postman contract missing %q", expected)
		}
	}
	for _, tier := range []string{`"quotaTierBytes", "value": "10000000000"`, `"rejectQuotaTierBytes", "value": "25000000000"`} {
		if !strings.Contains(content, tier) { t.Fatalf("Postman default tier does not match Cloud defaults: %s", tier) }
	}
	if strings.Contains(content, "X-Admin-Actor-ID") {
		t.Fatal("browser collection must not choose the admin actor")
	}
	adminDoc, err := os.ReadFile(filepath.Join(root, "docs", "phase3-admin-quota-review.md"))
	if err != nil {
		t.Fatal(err)
	}
	for _, expected := range []string{"cloud.quota.review", "X-Request-ID", "service token"} {
		if !strings.Contains(string(adminDoc), expected) {
			t.Fatalf("admin boundary documentation missing %q", expected)
		}
	}
}
