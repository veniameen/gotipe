-- infra/scripts/rate-limit.lua
-- Sliding window rate limiter (atomic operation in Valkey)
--
-- KEYS[1] = rate limit key (e.g. "rl:apikey:gt_live_abc:api")
-- ARGV[1] = limit (max requests per window)
-- ARGV[2] = window (milliseconds)
-- ARGV[3] = now (current timestamp in milliseconds)
--
-- Returns: 1 = allowed, 0 = denied

local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local window_start = now - window

-- 1. Remove expired entries outside the window
redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

-- 2. Count current requests in the window
local count = redis.call('ZCARD', key)

if count < limit then
    -- 3. Add current request (score = timestamp, member = unique ID)
    redis.call('ZADD', key, now, now .. ':' .. math.random(1000000))
    redis.call('PEXPIRE', key, window)
    return 1  -- allowed
else
    redis.call('PEXPIRE', key, window)
    return 0  -- denied
end
