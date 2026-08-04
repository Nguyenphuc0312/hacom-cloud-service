package cloud

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
)

const (
	DefaultPageSize = 20
	MaxPageSize     = 100
	MaxTitleRunes   = 512
)

type Store interface {
	CreateText(
		ctx context.Context,
		ownerUserID uuid.UUID,
		content string,
		sizeBytes int64,
	) (Item, error)
	CreateLink(
		ctx context.Context,
		ownerUserID uuid.UUID,
		rawURL string,
		title *string,
		sizeBytes int64,
	) (Item, error)
	GetItem(ctx context.Context, ownerUserID, itemID uuid.UUID) (Item, error)
	ListItems(
		ctx context.Context,
		ownerUserID uuid.UUID,
		cursor *Cursor,
		limit int,
	) ([]Item, bool, error)
	GetQuota(ctx context.Context, ownerUserID uuid.UUID) (Quota, error)
}

type Service struct {
	store           Store
	maxContentBytes int64
}

func NewService(store Store, maxContentBytes int64) (*Service, error) {
	if store == nil {
		return nil, errors.New("cloud store is required")
	}
	if maxContentBytes <= 0 {
		return nil, errors.New("maximum content size must be positive")
	}
	return &Service{store: store, maxContentBytes: maxContentBytes}, nil
}

func (s *Service) CreateText(
	ctx context.Context,
	ownerUserID uuid.UUID,
	content string,
) (Item, error) {
	if ownerUserID == uuid.Nil {
		return Item{}, fmt.Errorf("%w: owner user ID is required", ErrInvalidContent)
	}
	if strings.TrimSpace(content) == "" {
		return Item{}, fmt.Errorf("%w: text content must not be blank", ErrInvalidContent)
	}
	sizeBytes := UTF8Bytes(content)
	if sizeBytes > s.maxContentBytes {
		return Item{}, fmt.Errorf(
			"%w: content is %d bytes; maximum is %d bytes",
			ErrInvalidContent,
			sizeBytes,
			s.maxContentBytes,
		)
	}
	return s.store.CreateText(ctx, ownerUserID, content, sizeBytes)
}

func (s *Service) CreateLink(
	ctx context.Context,
	ownerUserID uuid.UUID,
	rawURL string,
	title string,
) (Item, error) {
	if ownerUserID == uuid.Nil {
		return Item{}, fmt.Errorf("%w: owner user ID is required", ErrInvalidContent)
	}

	normalizedURL, err := validateHTTPURL(rawURL)
	if err != nil {
		return Item{}, err
	}

	title = strings.TrimSpace(title)
	if utf8.RuneCountInString(title) > MaxTitleRunes {
		return Item{}, fmt.Errorf(
			"%w: link title must not exceed %d characters",
			ErrInvalidContent,
			MaxTitleRunes,
		)
	}
	var titlePointer *string
	if title != "" {
		titlePointer = &title
	}

	sizeBytes := UTF8Bytes(normalizedURL) + UTF8Bytes(title)
	if sizeBytes > s.maxContentBytes {
		return Item{}, fmt.Errorf(
			"%w: content is %d bytes; maximum is %d bytes",
			ErrInvalidContent,
			sizeBytes,
			s.maxContentBytes,
		)
	}
	return s.store.CreateLink(
		ctx,
		ownerUserID,
		normalizedURL,
		titlePointer,
		sizeBytes,
	)
}

func (s *Service) GetItem(
	ctx context.Context,
	ownerUserID, itemID uuid.UUID,
) (Item, error) {
	if ownerUserID == uuid.Nil || itemID == uuid.Nil {
		return Item{}, fmt.Errorf("%w: owner and item IDs are required", ErrInvalidContent)
	}
	return s.store.GetItem(ctx, ownerUserID, itemID)
}

func (s *Service) ListItems(
	ctx context.Context,
	ownerUserID uuid.UUID,
	cursorValue string,
	limit int,
) (Page, error) {
	if ownerUserID == uuid.Nil {
		return Page{}, fmt.Errorf("%w: owner user ID is required", ErrInvalidContent)
	}
	if limit == 0 {
		limit = DefaultPageSize
	}
	if limit < 1 || limit > MaxPageSize {
		return Page{}, fmt.Errorf(
			"%w: limit must be between 1 and %d",
			ErrInvalidContent,
			MaxPageSize,
		)
	}

	var cursor *Cursor
	if cursorValue != "" {
		decoded, err := DecodeCursor(cursorValue)
		if err != nil {
			return Page{}, err
		}
		cursor = &decoded
	}

	items, hasMore, err := s.store.ListItems(ctx, ownerUserID, cursor, limit)
	if err != nil {
		return Page{}, err
	}
	page := Page{Items: items}
	if hasMore && len(items) > 0 {
		last := items[len(items)-1]
		page.NextCursor, err = EncodeCursor(Cursor{
			CreatedAt: last.CreatedAt,
			ID:        last.ID,
		})
		if err != nil {
			return Page{}, fmt.Errorf("encode next cursor: %w", err)
		}
	}
	return page, nil
}

func (s *Service) GetQuota(
	ctx context.Context,
	ownerUserID uuid.UUID,
) (Quota, error) {
	if ownerUserID == uuid.Nil {
		return Quota{}, fmt.Errorf("%w: owner user ID is required", ErrInvalidContent)
	}
	return s.store.GetQuota(ctx, ownerUserID)
}

func UTF8Bytes(value string) int64 {
	return int64(len([]byte(value)))
}

type cursorPayload struct {
	CreatedAt string `json:"created_at"`
	ID        string `json:"id"`
}

func EncodeCursor(cursor Cursor) (string, error) {
	if cursor.CreatedAt.IsZero() || cursor.ID == uuid.Nil {
		return "", ErrInvalidCursor
	}
	payload, err := json.Marshal(cursorPayload{
		CreatedAt: cursor.CreatedAt.UTC().Format(time.RFC3339Nano),
		ID:        cursor.ID.String(),
	})
	if err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(payload), nil
}

func DecodeCursor(value string) (Cursor, error) {
	raw, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return Cursor{}, ErrInvalidCursor
	}
	var payload cursorPayload
	if err := json.Unmarshal(raw, &payload); err != nil {
		return Cursor{}, ErrInvalidCursor
	}
	createdAt, err := time.Parse(time.RFC3339Nano, payload.CreatedAt)
	if err != nil {
		return Cursor{}, ErrInvalidCursor
	}
	id, err := uuid.Parse(payload.ID)
	if err != nil || id == uuid.Nil {
		return Cursor{}, ErrInvalidCursor
	}
	return Cursor{CreatedAt: createdAt, ID: id}, nil
}

func validateHTTPURL(rawURL string) (string, error) {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return "", fmt.Errorf("%w: link URL must not be blank", ErrInvalidContent)
	}
	parsed, err := url.ParseRequestURI(rawURL)
	if err != nil ||
		(parsed.Scheme != "http" && parsed.Scheme != "https") ||
		parsed.Host == "" {
		return "", fmt.Errorf("%w: link URL must be an absolute HTTP or HTTPS URL", ErrInvalidContent)
	}
	return parsed.String(), nil
}
