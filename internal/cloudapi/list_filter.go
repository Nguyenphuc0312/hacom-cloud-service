package cloudapi

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/cloud"
)

var allowedListQueryParameters = map[string]struct{}{
	"q": {}, "type": {}, "from": {}, "to": {}, "cursor": {}, "limit": {},
}

func parseListRequest(writer http.ResponseWriter, request *http.Request) (cloud.ListRequest, bool) {
	query := request.URL.Query()
	for key, values := range query {
		if _, allowed := allowedListQueryParameters[key]; !allowed || len(values) != 1 {
			writeError(writer, http.StatusBadRequest, "INVALID_FILTER", "list query contains an unsupported or repeated parameter")
			return cloud.ListRequest{}, false
		}
		if values[0] == "" {
			code := "INVALID_FILTER"
			if key == "limit" {
				code = "INVALID_LIMIT"
			}
			writeError(writer, http.StatusBadRequest, code, key+" must not be empty")
			return cloud.ListRequest{}, false
		}
	}

	result := cloud.ListRequest{Cursor: query.Get("cursor")}
	if rawLimit := query.Get("limit"); rawLimit != "" {
		limit, err := strconv.Atoi(rawLimit)
		if err != nil || limit < 1 || limit > cloud.MaxPageSize {
			writeError(writer, http.StatusBadRequest, "INVALID_LIMIT", "limit must be an integer between 1 and 100")
			return cloud.ListRequest{}, false
		}
		result.Limit = limit
	}
	result.Filter.Query = query.Get("q")
	result.Filter.Type = cloud.ItemType(query.Get("type"))
	if _, present := query["q"]; present && strings.TrimSpace(result.Filter.Query) == "" {
		writeError(writer, http.StatusBadRequest, "INVALID_FILTER", "q must not be blank")
		return cloud.ListRequest{}, false
	}

	var ok bool
	result.Filter.From, ok = parseOptionalListTime(writer, query.Get("from"), "from")
	if !ok {
		return cloud.ListRequest{}, false
	}
	result.Filter.To, ok = parseOptionalListTime(writer, query.Get("to"), "to")
	if !ok {
		return cloud.ListRequest{}, false
	}
	return result, true
}

func parseOptionalListTime(
	writer http.ResponseWriter,
	value, name string,
) (time.Time, bool) {
	if value == "" {
		return time.Time{}, true
	}
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		writeError(writer, http.StatusBadRequest, "INVALID_FILTER", name+" must be an RFC3339 timestamp")
		return time.Time{}, false
	}
	return parsed.UTC(), true
}
