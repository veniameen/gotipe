package middleware

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/gotipe/cloud/internal/apierror"
	"github.com/gotipe/cloud/internal/auth"
	"github.com/gotipe/cloud/internal/storage"
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
    redis.call('ZADD', key, now, now .. ':' .. math.random(1000000))
    redis.call('PEXPIRE', key, window)
    return 1
else
    redis.call('PEXPIRE', key, window)
    return 0
end
`

type RateLimiter struct {
	valkey *storage.ValkeyStore
	limit  int
	window time.Duration
}

func NewRateLimiter(valkeyStore *storage.ValkeyStore, limit int, window time.Duration) (*RateLimiter, error) {
	return &RateLimiter{
		valkey: valkeyStore,
		limit:  limit,
		window: window,
	}, nil
}

func (rl *RateLimiter) Allow(ctx context.Context, key string) bool {
	now := time.Now().UnixMilli()
	result, err := rl.valkey.Eval(ctx, rateLimitLua,
		[]string{key},
		rl.limit, rl.window.Milliseconds(), now,
	)
	if err != nil {
		// Graceful degradation: if Valkey unavailable, allow request
		return true
	}
	return result == 1
}

func (rl *RateLimiter) Middleware() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user := auth.UserFromContext(r.Context())
			if user == nil {
				next.ServeHTTP(w, r)
				return
			}

			key := fmt.Sprintf("rl:api:%s", user.UserID)
			if !rl.Allow(r.Context(), key) {
				w.Header().Set("Retry-After", fmt.Sprintf("%d", int(rl.window.Seconds())))
				apierror.ErrRateLimited.Write(w)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
