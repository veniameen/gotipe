package storage

import (
	"context"
	"time"
)

const MaxObjectBytes int64 = 64 << 20

// ObjectStore holds immutable document contents and downloadable artifacts.
type ObjectStore interface {
	Put(context.Context, string, []byte) error
	Get(context.Context, string) ([]byte, error)
	Delete(context.Context, string) error
	PresignedURL(context.Context, string, time.Duration) (string, error)
}
