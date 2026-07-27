package cloudapi

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/cloud"
)

type itemResponse struct {
	ID        string           `json:"id"`
	Type      cloud.ItemType   `json:"type"`
	Status    cloud.ItemStatus `json:"status"`
	Title     *string          `json:"title,omitempty"`
	Content   *string          `json:"content,omitempty"`
	URL       *string          `json:"url,omitempty"`
	SizeBytes int64            `json:"sizeBytes"`
	CreatedAt time.Time        `json:"createdAt"`
	UpdatedAt time.Time        `json:"updatedAt"`
}

type listItemsResponse struct {
	Items      []itemResponse `json:"items"`
	NextCursor string         `json:"nextCursor,omitempty"`
}

type quotaResponse struct {
	LimitBytes     int64     `json:"limitBytes"`
	UsedBytes      int64     `json:"usedBytes"`
	ReservedBytes  int64     `json:"reservedBytes"`
	AvailableBytes int64     `json:"availableBytes"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

type errorEnvelope struct {
	Error apiError `json:"error"`
}

type apiError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func itemResponseFrom(item cloud.Item) itemResponse {
	return itemResponse{
		ID:        item.ID.String(),
		Type:      item.Type,
		Status:    item.Status,
		Title:     item.Title,
		Content:   item.TextContent,
		URL:       item.LinkURL,
		SizeBytes: item.SizeBytes,
		CreatedAt: item.CreatedAt,
		UpdatedAt: item.UpdatedAt,
	}
}

func writeError(
	writer http.ResponseWriter,
	status int,
	code string,
	message string,
) {
	writeJSON(writer, status, errorEnvelope{
		Error: apiError{Code: code, Message: message},
	})
}

func writeJSON(writer http.ResponseWriter, status int, payload any) {
	writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(payload)
}
