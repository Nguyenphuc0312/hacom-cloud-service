package quota

import (
	"context"
	"errors"
	"sync"
	"testing"
)

func newTestService(t *testing.T) (*Service, *MemoryRepository) {
	t.Helper()
	repository := NewMemoryRepository()
	service, err := NewService(repository)
	if err != nil {
		t.Fatal(err)
	}
	return service, repository
}

func TestEnsureDefaultQuotaIsFiveGiBAndIdempotent(t *testing.T) {
	service, _ := newTestService(t)
	ctx := context.Background()

	first, err := service.EnsureDefaultQuota(ctx, "owner-1")
	if err != nil {
		t.Fatal(err)
	}
	second, err := service.EnsureDefaultQuota(ctx, "owner-1")
	if err != nil {
		t.Fatal(err)
	}

	if first.LimitBytes != 5*1024*1024*1024 {
		t.Fatalf("LimitBytes = %d, want %d", first.LimitBytes, DefaultLimitBytes)
	}
	if second != first {
		t.Fatalf("second EnsureDefaultQuota() = %+v, want %+v", second, first)
	}
}

func TestUTF8Bytes(t *testing.T) {
	tests := []struct {
		name  string
		value string
		want  int64
	}{
		{name: "ASCII text", value: "hello", want: 5},
		{name: "Vietnamese text", value: "Việt", want: 6},
		{name: "link", value: "https://hacom.vn", want: 16},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := UTF8Bytes(test.value); got != test.want {
				t.Fatalf("UTF8Bytes(%q) = %d, want %d", test.value, got, test.want)
			}
		})
	}
}

func TestAddTextAndLinkKeepUsageEqualToLedger(t *testing.T) {
	service, repository := newTestService(t)
	ctx := context.Background()

	text, err := service.AddText(ctx, "owner-1", "Việt", "text-request-1")
	if err != nil {
		t.Fatal(err)
	}
	link, err := service.AddLink(ctx, "owner-1", "https://hacom.vn", "link-request-1")
	if err != nil {
		t.Fatal(err)
	}

	wantBytes := UTF8Bytes("Việt") + UTF8Bytes("https://hacom.vn")
	if link.Usage.UsedBytes != wantBytes {
		t.Fatalf("UsedBytes = %d, want %d", link.Usage.UsedBytes, wantBytes)
	}
	if text.Entry.EventType != EventTextCreated || link.Entry.EventType != EventLinkCreated {
		t.Fatalf("unexpected ledger event types: %q, %q", text.Entry.EventType, link.Entry.EventType)
	}

	var ledgerTotal int64
	for _, entry := range repository.LedgerEntries() {
		ledgerTotal += entry.DeltaBytes
	}
	if ledgerTotal != link.Usage.UsedBytes {
		t.Fatalf("ledger total = %d, used bytes = %d", ledgerTotal, link.Usage.UsedBytes)
	}
}

func TestRetryDoesNotApplyUsageTwice(t *testing.T) {
	service, repository := newTestService(t)
	ctx := context.Background()

	first, err := service.AddText(ctx, "owner-1", "retry me", "same-key")
	if err != nil {
		t.Fatal(err)
	}
	second, err := service.AddText(ctx, "owner-1", "retry me", "same-key")
	if err != nil {
		t.Fatal(err)
	}

	if !first.Applied {
		t.Fatal("first request was not applied")
	}
	if second.Applied {
		t.Fatal("retry was applied twice")
	}
	if second.Usage.UsedBytes != UTF8Bytes("retry me") {
		t.Fatalf("UsedBytes = %d, want %d", second.Usage.UsedBytes, UTF8Bytes("retry me"))
	}
	if len(repository.LedgerEntries()) != 1 {
		t.Fatalf("ledger entries = %d, want 1", len(repository.LedgerEntries()))
	}
}

func TestReusingKeyForDifferentOperationReturnsConflict(t *testing.T) {
	service, _ := newTestService(t)
	ctx := context.Background()

	if _, err := service.AddText(ctx, "owner-1", "first", "same-key"); err != nil {
		t.Fatal(err)
	}
	_, err := service.AddLink(ctx, "owner-1", "https://hacom.vn", "same-key")
	if !errors.Is(err, ErrIdempotencyConflict) {
		t.Fatalf("error = %v, want ErrIdempotencyConflict", err)
	}
}

func TestApplyUsageRejectsQuotaExceeded(t *testing.T) {
	repository := NewMemoryRepository()
	ctx := context.Background()
	if _, err := repository.EnsureQuota(ctx, "owner-1", 10); err != nil {
		t.Fatal(err)
	}

	_, err := repository.ApplyUsage(ctx, ApplyRequest{
		OwnerID:        "owner-1",
		IdempotencyKey: "too-large",
		EventType:      EventTextCreated,
		DeltaBytes:     11,
	})
	if !errors.Is(err, ErrQuotaExceeded) {
		t.Fatalf("error = %v, want ErrQuotaExceeded", err)
	}

	usage, err := repository.GetUsage(ctx, "owner-1")
	if err != nil {
		t.Fatal(err)
	}
	if usage.UsedBytes != 0 || len(repository.LedgerEntries()) != 0 {
		t.Fatalf("failed operation changed state: usage=%+v ledger=%+v", usage, repository.LedgerEntries())
	}
}

func TestConcurrentRetryIsAppliedOnce(t *testing.T) {
	service, repository := newTestService(t)
	ctx := context.Background()

	const requests = 20
	var waitGroup sync.WaitGroup
	waitGroup.Add(requests)
	errs := make(chan error, requests)

	for range requests {
		go func() {
			defer waitGroup.Done()
			_, err := service.AddText(ctx, "owner-1", "concurrent", "one-key")
			errs <- err
		}()
	}
	waitGroup.Wait()
	close(errs)

	for err := range errs {
		if err != nil {
			t.Errorf("AddText() error = %v", err)
		}
	}
	usage, err := service.GetUsage(ctx, "owner-1")
	if err != nil {
		t.Fatal(err)
	}
	if usage.UsedBytes != UTF8Bytes("concurrent") {
		t.Fatalf("UsedBytes = %d, want %d", usage.UsedBytes, UTF8Bytes("concurrent"))
	}
	if len(repository.LedgerEntries()) != 1 {
		t.Fatalf("ledger entries = %d, want 1", len(repository.LedgerEntries()))
	}
}
