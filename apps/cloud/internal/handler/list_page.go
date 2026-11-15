package handler

import (
	"encoding/base64"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Comments and versions are listed page by page in a stable order: creation time,
// then ID. A page that is not the last one names its last item in an opaque cursor,
// and the next page starts strictly after that item. Items created, resolved or
// deleted in between therefore neither repeat nor shift the remaining pages, as
// they would with an offset.
const (
	defaultPageLimit = 50
	maxPageLimit     = 100
)

var errInvalidCursor = errors.New("cursor is not a cursor from this list")

type listPage[T any] struct {
	Data       []T    `json:"data"`
	HasMore    bool   `json:"has_more"`
	NextCursor string `json:"next_cursor,omitempty"`
}

// pageCursor is the position of the last item of the previous page.
type pageCursor struct {
	createdAt time.Time
	id        string
}

// pageQuery reads `limit` (1–100, otherwise 50) and the optional `cursor`.
func pageQuery(r *http.Request) (int, *pageCursor, error) {
	query := r.URL.Query()
	limit, err := strconv.Atoi(query.Get("limit"))
	if err != nil || limit <= 0 || limit > maxPageLimit {
		limit = defaultPageLimit
	}
	raw := query.Get("cursor")
	if raw == "" {
		return limit, nil, nil
	}
	cursor, err := decodeCursor(raw)
	return limit, cursor, err
}

func encodeCursor(createdAt time.Time, id string) string {
	position := createdAt.UTC().Format(time.RFC3339Nano) + " " + id
	return base64.RawURLEncoding.EncodeToString([]byte(position))
}

func decodeCursor(raw string) (*pageCursor, error) {
	position, err := base64.RawURLEncoding.DecodeString(raw)
	if err != nil {
		return nil, errInvalidCursor
	}
	stamp, rawID, found := strings.Cut(string(position), " ")
	if !found {
		return nil, errInvalidCursor
	}
	createdAt, err := time.Parse(time.RFC3339Nano, stamp)
	if err != nil {
		return nil, errInvalidCursor
	}
	id, valid := canonicalUUID(rawID)
	if !valid {
		return nil, errInvalidCursor
	}
	return &pageCursor{createdAt: createdAt, id: id}, nil
}

// newListPage receives up to limit+1 items: the extra one only tells that another
// page exists and is not returned.
func newListPage[T any](items []T, limit int, position func(T) (time.Time, string)) listPage[T] {
	if len(items) <= limit {
		if items == nil {
			items = []T{}
		}
		return listPage[T]{Data: items}
	}
	items = items[:limit]
	createdAt, id := position(items[limit-1])
	return listPage[T]{Data: items, HasMore: true, NextCursor: encodeCursor(createdAt, id)}
}
