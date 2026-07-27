package upload

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
)

type CompleteUseCase interface {
	Complete(ctx context.Context, request CompleteRequest) (CompleteResult, error)
}

type OwnerResolver func(*http.Request) (string, error)

type CompleteHandler struct {
	service      CompleteUseCase
	resolveOwner OwnerResolver
}

func NewCompleteHandler(service CompleteUseCase, resolveOwner OwnerResolver) (*CompleteHandler, error) {
	if service == nil {
		return nil, errors.New("complete service is required")
	}
	if resolveOwner == nil {
		return nil, errors.New("owner resolver is required")
	}
	return &CompleteHandler{service: service, resolveOwner: resolveOwner}, nil
}

func (h *CompleteHandler) ServeHTTP(response http.ResponseWriter, request *http.Request) {
	ownerID, err := h.resolveOwner(request)
	if err != nil || ownerID == "" {
		writeCompleteError(response, http.StatusUnauthorized, "UNAUTHORIZED", "authentication is required")
		return
	}

	var body struct {
		SessionID string `json:"session_id"`
	}
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&body); err != nil || body.SessionID == "" {
		writeCompleteError(response, http.StatusBadRequest, "INVALID_REQUEST", "session_id is required")
		return
	}

	result, err := h.service.Complete(request.Context(), CompleteRequest{
		OwnerID:   ownerID,
		SessionID: body.SessionID,
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrSessionNotFound):
			writeCompleteError(response, http.StatusNotFound, "UPLOAD_SESSION_NOT_FOUND", err.Error())
		case errors.Is(err, ErrSessionForbidden):
			writeCompleteError(response, http.StatusForbidden, "UPLOAD_SESSION_FORBIDDEN", err.Error())
		case errors.Is(err, ErrFileTooLarge), errors.Is(err, ErrObjectSizeMismatch):
			writeCompleteError(response, http.StatusUnprocessableEntity, "INVALID_UPLOADED_OBJECT", err.Error())
		case errors.Is(err, ErrSessionRejected):
			writeCompleteError(response, http.StatusConflict, "UPLOAD_SESSION_REJECTED", err.Error())
		default:
			writeCompleteError(response, http.StatusInternalServerError, "INTERNAL_ERROR", "complete upload failed")
		}
		return
	}

	response.Header().Set("Content-Type", "application/json")
	response.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(response).Encode(result)
}

func writeCompleteError(response http.ResponseWriter, status int, code, message string) {
	response.Header().Set("Content-Type", "application/json")
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(map[string]string{
		"code":    code,
		"message": message,
	})
}
