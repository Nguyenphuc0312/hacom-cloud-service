package cloud

import (
	"context"
	"crypto/sha256"
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
	DefaultPageSize     = 20
	MaxPageSize         = 100
	MaxTitleRunes       = 512
	MinSearchQueryRunes = 3
	MaxSearchQueryRunes = 200
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
		filter ListFilter,
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
	request ListRequest,
) (Page, error) {
	if ownerUserID == uuid.Nil {
		return Page{}, fmt.Errorf("%w: owner user ID is required", ErrInvalidContent)
	}
	filter, cursor, limit, fingerprint, err := PrepareListRequest(request, "active")
	if err != nil {
		return Page{}, err
	}

	items, hasMore, err := s.store.ListItems(ctx, ownerUserID, cursor, limit, filter)
	if err != nil {
		return Page{}, err
	}
	page := Page{Items: items}
	if hasMore && len(items) > 0 {
		last := items[len(items)-1]
		page.NextCursor, err = EncodeCursor(Cursor{
			CreatedAt:         last.CreatedAt,
			ID:                last.ID,
			FilterFingerprint: fingerprint,
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
	Version           int    `json:"v"`
	CreatedAt         string `json:"created_at"`
	ID                string `json:"id"`
	FilterFingerprint string `json:"filter"`
}

func EncodeCursor(cursor Cursor) (string, error) {
	if cursor.CreatedAt.IsZero() || cursor.ID == uuid.Nil || cursor.FilterFingerprint == "" {
		return "", ErrInvalidCursor
	}
	payload, err := json.Marshal(cursorPayload{
		Version:           2,
		CreatedAt:         cursor.CreatedAt.UTC().Format(time.RFC3339Nano),
		ID:                cursor.ID.String(),
		FilterFingerprint: cursor.FilterFingerprint,
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
	if err := json.Unmarshal(raw, &payload); err != nil || payload.Version != 2 || payload.FilterFingerprint == "" {
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
	return Cursor{CreatedAt: createdAt, ID: id, FilterFingerprint: payload.FilterFingerprint}, nil
}

func PrepareListRequest(
	request ListRequest,
	scope string,
) (ListFilter, *Cursor, int, string, error) {
	filter, err := NormalizeListFilter(request.Filter)
	if err != nil {
		return ListFilter{}, nil, 0, "", err
	}
	limit := request.Limit
	if limit == 0 {
		limit = DefaultPageSize
	}
	if limit < 1 || limit > MaxPageSize {
		return ListFilter{}, nil, 0, "", fmt.Errorf(
			"%w: limit must be between 1 and %d", ErrInvalidFilter, MaxPageSize,
		)
	}
	fingerprint := ListFilterFingerprint(scope, filter)
	var cursor *Cursor
	if request.Cursor != "" {
		decoded, decodeErr := DecodeCursor(request.Cursor)
		if decodeErr != nil || decoded.FilterFingerprint != fingerprint {
			return ListFilter{}, nil, 0, "", ErrInvalidCursor
		}
		cursor = &decoded
	}
	return filter, cursor, limit, fingerprint, nil
}

func NormalizeListFilter(filter ListFilter) (ListFilter, error) {
	filter.Query = strings.Join(strings.Fields(filter.Query), " ")
	queryRunes := utf8.RuneCountInString(filter.Query)
	if queryRunes > 0 && (queryRunes < MinSearchQueryRunes || queryRunes > MaxSearchQueryRunes) {
		return ListFilter{}, fmt.Errorf(
			"%w: q must contain %d to %d characters",
			ErrInvalidFilter, MinSearchQueryRunes, MaxSearchQueryRunes,
		)
	}
	if filter.Type != "" && !validItemType(filter.Type) {
		return ListFilter{}, fmt.Errorf("%w: unsupported item type", ErrInvalidFilter)
	}
	filter.From = normalizeOptionalTime(filter.From)
	filter.To = normalizeOptionalTime(filter.To)
	if !filter.From.IsZero() && !filter.To.IsZero() && filter.From.After(filter.To) {
		return ListFilter{}, fmt.Errorf("%w: from must not be after to", ErrInvalidFilter)
	}
	return filter, nil
}

func ListFilterFingerprint(scope string, filter ListFilter) string {
	canonical := strings.Join([]string{
		strings.TrimSpace(scope),
		strings.ToLower(filter.Query),
		string(filter.Type),
		formatOptionalTime(filter.From),
		formatOptionalTime(filter.To),
	}, "\x1f")
	return fmt.Sprintf("%x", sha256.Sum256([]byte(canonical)))
}

func validItemType(itemType ItemType) bool {
	switch itemType {
	case ItemTypeText, ItemTypeLink, ItemTypeFile, ItemTypeImage, ItemTypeVideo, ItemTypeAudio:
		return true
	default:
		return false
	}
}

func normalizeOptionalTime(value time.Time) time.Time {
	if value.IsZero() {
		return time.Time{}
	}
	return value.UTC()
}

func formatOptionalTime(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.UTC().Format(time.RFC3339Nano)
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
