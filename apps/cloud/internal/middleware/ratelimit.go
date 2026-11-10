package middleware

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/gotipe/cloud/internal/apierror"
	"github.com/gotipe/cloud/internal/auth"
)

// Lua script: sliding window rate limiter
const rateLimitLua = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local window_start = now - window

redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

local count = redis.call('ZCARD', key)

if count < limit then
    redis.call('ZADD', key, now, ARGV[4])
    redis.call('PEXPIRE', key, window)
    return 1
else
    redis.call('PEXPIRE', key, window)
    return 0
end
`

type RateLimiter struct {
	valkey RateLimitStore
	limit  int
	window time.Duration
}

type RateLimitStore interface {
	Eval(context.Context, string, []string, ...interface{}) (int64, error)
}

func NewRateLimiter(valkeyStore RateLimitStore, limit int, window time.Duration) (*RateLimiter, error) {
	if valkeyStore == nil || limit <= 0 || window < time.Millisecond {
		return nil, fmt.Errorf("rate limiter requires storage and positive limits")
	}
	return &RateLimiter{
		valkey: valkeyStore,
		limit:  limit,
		window: window,
	}, nil
}

func (rl *RateLimiter) Allow(ctx context.Context, key string) (bool, error) {
	now := time.Now().UnixMilli()
	result, err := rl.valkey.Eval(ctx, rateLimitLua,
		[]string{key},
		rl.limit, rl.window.Milliseconds(), now, uuid.NewString(),
	)
	if err != nil {
		return false, err
	}
	return result == 1, nil
}

func (rl *RateLimiter) Middleware(namespaces ...string) func(http.Handler) http.Handler {
	namespace := "api"
	if len(namespaces) > 0 {
		namespace = namespaces[0]
	}
	return rl.middleware(func(r *http.Request) string {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			return ""
		}
		return "rl:" + namespace + ":" + user.UserID
	})
}

// IPMiddleware uses the socket peer, never an untrusted X-Forwarded-For header.
// Reverse proxies should apply their own per-client gate before forwarding.
func (rl *RateLimiter) IPMiddleware() func(http.Handler) http.Handler {
	return rl.middleware(func(r *http.Request) string {
		host, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			host = r.RemoteAddr
		}
		return "rl:auth:" + host
	})
}

func (rl *RateLimiter) middleware(keyFor func(*http.Request) string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key := keyFor(r)
			if key == "" {
				next.ServeHTTP(w, r)
				return
			}

			allowed, err := rl.Allow(r.Context(), key)
			if err != nil {
				apierror.ErrServiceDown.Write(w)
				return
			}
			if !allowed {
				w.Header().Set("Retry-After", fmt.Sprintf("%d", int(rl.window.Seconds())))
				apierror.ErrRateLimited.Write(w)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
