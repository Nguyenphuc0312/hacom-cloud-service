package cloud

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

type fakeStore struct {
	createText func(context.Context, uuid.UUID, string, int64) (Item, error)
	createLink func(context.Context, uuid.UUID, string, *string, int64) (Item, error)
	getItem    func(context.Context, uuid.UUID, uuid.UUID) (Item, error)
	listItems  func(context.Context, uuid.UUID, *Cursor, int) ([]Item, bool, error)
	getQuota   func(context.Context, uuid.UUID) (Quota, error)
}

func (s fakeStore) CreateText(
	ctx context.Context,
	ownerID uuid.UUID,
	content string,
	size int64,
) (Item, error) {
	return s.createText(ctx, ownerID, content, size)
}

func (s fakeStore) CreateLink(
	ctx context.Context,
	ownerID uuid.UUID,
	rawURL string,
	title *string,
	size int64,
) (Item, error) {
	return s.createLink(ctx, ownerID, rawURL, title, size)
}

func (s fakeStore) GetItem(
	ctx context.Context,
	ownerID, itemID uuid.UUID,
) (Item, error) {
	return s.getItem(ctx, ownerID, itemID)
}

func (s fakeStore) ListItems(
	ctx context.Context,
	ownerID uuid.UUID,
	cursor *Cursor,
	limit int,
) ([]Item, bool, error) {
	return s.listItems(ctx, ownerID, cursor, limit)
}

func (s fakeStore) GetQuota(
	ctx context.Context,
	ownerID uuid.UUID,
) (Quota, error) {
	return s.getQuota(ctx, ownerID)
}

func TestCreateTextCountsUTF8BytesWithoutDeduplicating(t *testing.T) {
	ownerID := uuid.New()
	calls := 0
	store := fakeStore{
		createText: func(
			_ context.Context,
			gotOwnerID uuid.UUID,
			content string,
			size int64,
		) (Item, error) {
			calls++
			if gotOwnerID != ownerID {
				t.Fatalf("owner ID = %s, want %s", gotOwnerID, ownerID)
			}
			if content != "Việt" || size != 6 {
				t.Fatalf("content = %q, size = %d", content, size)
			}
			return Item{ID: uuid.New(), Type: ItemTypeText}, nil
		},
	}
	service, err := NewService(store, 100_000_000)
	if err != nil {
		t.Fatal(err)
	}

	first, err := service.CreateText(context.Background(), ownerID, "Việt")
	if err != nil {
		t.Fatal(err)
	}
	second, err := service.CreateText(context.Background(), ownerID, "Việt")
	if err != nil {
		t.Fatal(err)
	}

	if calls != 2 {
		t.Fatalf("CreateText calls = %d, want 2", calls)
	}
	if first.ID == second.ID {
		t.Fatal("two intentional saves must remain separate items")
	}
}

func TestCreateTextRejectsBlankAndOversizedContent(t *testing.T) {
	store := fakeStore{
		createText: func(context.Context, uuid.UUID, string, int64) (Item, error) {
			t.Fatal("store must not be called")
			return Item{}, nil
		},
	}
	service, err := NewService(store, 5)
	if err != nil {
		t.Fatal(err)
	}

	for _, content := range []string{"  \n\t", "123456"} {
		if _, err := service.CreateText(
			context.Background(),
			uuid.New(),
			content,
		); !errors.Is(err, ErrInvalidContent) {
			t.Fatalf("CreateText(%q) error = %v", content, err)
		}
	}
}

func TestCreateLinkValidatesURLAndCountsTitle(t *testing.T) {
	ownerID := uuid.New()
	store := fakeStore{
		createLink: func(
			_ context.Context,
			gotOwnerID uuid.UUID,
			rawURL string,
			title *string,
			size int64,
		) (Item, error) {
			if gotOwnerID != ownerID || rawURL != "https://hacom.vn/cloud" {
				t.Fatalf("unexpected owner or URL: %s %q", gotOwnerID, rawURL)
			}
			if title == nil || *title != "Tài liệu" {
				t.Fatalf("title = %v", title)
			}
			wantSize := UTF8Bytes(rawURL) + UTF8Bytes(*title)
			if size != wantSize {
				t.Fatalf("size = %d, want %d", size, wantSize)
			}
			return Item{ID: uuid.New(), Type: ItemTypeLink}, nil
		},
	}
	service, err := NewService(store, 100_000_000)
	if err != nil {
		t.Fatal(err)
	}

	if _, err := service.CreateLink(
		context.Background(),
		ownerID,
		"https://hacom.vn/cloud",
		" Tài liệu ",
	); err != nil {
		t.Fatal(err)
	}

	for _, invalidURL := range []string{"", "hacom.vn", "ftp://hacom.vn", "/relative"} {
		if _, err := service.CreateLink(
			context.Background(),
			ownerID,
			invalidURL,
			"",
		); !errors.Is(err, ErrInvalidContent) {
			t.Fatalf("CreateLink(%q) error = %v", invalidURL, err)
		}
	}

	if _, err := service.CreateLink(
		context.Background(),
		ownerID,
		"https://hacom.vn",
		strings.Repeat("a", MaxTitleRunes+1),
	); !errors.Is(err, ErrInvalidContent) {
		t.Fatalf("oversized title error = %v", err)
	}
}

func TestListItemsUsesCursorAndCreatesNextCursor(t *testing.T) {
	ownerID := uuid.New()
	cursorTime := time.Now().UTC().Truncate(time.Microsecond)
	cursorID := uuid.New()
	store := fakeStore{
		listItems: func(
			_ context.Context,
			gotOwnerID uuid.UUID,
			cursor *Cursor,
			limit int,
		) ([]Item, bool, error) {
			if gotOwnerID != ownerID || limit != 2 {
				t.Fatalf("owner = %s, limit = %d", gotOwnerID, limit)
			}
			if cursor == nil || !cursor.CreatedAt.Equal(cursorTime) || cursor.ID != cursorID {
				t.Fatalf("cursor = %+v", cursor)
			}
			return []Item{
				{ID: uuid.New(), CreatedAt: cursorTime.Add(-time.Second)},
				{ID: uuid.New(), CreatedAt: cursorTime.Add(-2 * time.Second)},
			}, true, nil
		},
	}
	service, err := NewService(store, 100)
	if err != nil {
		t.Fatal(err)
	}
	inputCursor, err := EncodeCursor(Cursor{CreatedAt: cursorTime, ID: cursorID})
	if err != nil {
		t.Fatal(err)
	}

	page, err := service.ListItems(context.Background(), ownerID, inputCursor, 2)
	if err != nil {
		t.Fatal(err)
	}
	if page.NextCursor == "" {
		t.Fatal("expected next cursor")
	}
	decoded, err := DecodeCursor(page.NextCursor)
	if err != nil {
		t.Fatal(err)
	}
	last := page.Items[len(page.Items)-1]
	if decoded.ID != last.ID || !decoded.CreatedAt.Equal(last.CreatedAt) {
		t.Fatalf("next cursor = %+v, last item = %+v", decoded, last)
	}
}

func TestListItemsRejectsInvalidCursorAndLimit(t *testing.T) {
	service, err := NewService(fakeStore{}, 100)
	if err != nil {
		t.Fatal(err)
	}
	ownerID := uuid.New()

	if _, err := service.ListItems(
		context.Background(),
		ownerID,
		"not-a-cursor",
		20,
	); !errors.Is(err, ErrInvalidCursor) {
		t.Fatalf("invalid cursor error = %v", err)
	}
	if _, err := service.ListItems(
		context.Background(),
		ownerID,
		"",
		MaxPageSize+1,
	); !errors.Is(err, ErrInvalidContent) {
		t.Fatalf("invalid limit error = %v", err)
	}
}

func TestQuotaAvailableBytesNeverReturnsNegative(t *testing.T) {
	quota := Quota{LimitBytes: 10, UsedBytes: 8, TrashBytes: 3, ReservedBytes: 4}
	if quota.AvailableBytes() != 0 {
		t.Fatalf("available bytes = %d, want 0", quota.AvailableBytes())
	}
	if quota.ActiveBytes() != 5 {
		t.Fatalf("active bytes = %d, want 5", quota.ActiveBytes())
	}
}
