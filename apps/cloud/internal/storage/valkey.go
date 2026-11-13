package storage

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/valkey-io/valkey-go"
)

type ValkeyStore struct {
	Client valkey.Client
}

func NewValkeyStore(url, password string) (*ValkeyStore, error) {
	opts, err := valkey.ParseURL(url)
	if err != nil {
		return nil, fmt.Errorf("parse valkey url: %w", err)
	}
	if password != "" {
		opts.Password = password
	}
	client, err := valkey.NewClient(opts)
	if err != nil {
		return nil, fmt.Errorf("create valkey client: %w", err)
	}
	return &ValkeyStore{Client: client}, nil
}

func (s *ValkeyStore) Close() {
	s.Client.Close()
}

func (s *ValkeyStore) Ping(ctx context.Context) error {
	return s.Client.Do(ctx, s.Client.B().Ping().Build()).Error()
}

// Set with TTL
func (s *ValkeyStore) Set(ctx context.Context, key string, value []byte, ttl time.Duration) error {
	return s.Client.Do(ctx, s.Client.B().Set().Key(key).Value(string(value)).Ex(ttl).Build()).Error()
}

// Get returns value or nil
func (s *ValkeyStore) Get(ctx context.Context, key string) ([]byte, error) {
	result, err := s.Client.Do(ctx, s.Client.B().Get().Key(key).Build()).AsBytes()
	if err != nil {
		if valkey.IsValkeyNil(err) {
			return nil, nil
		}
		return nil, err
	}
	return result, nil
}

// Del deletes a key
func (s *ValkeyStore) Del(ctx context.Context, key string) error {
	return s.Client.Do(ctx, s.Client.B().Del().Key(key).Build()).Error()
}

// Eval executes a Lua script directly
func (s *ValkeyStore) Eval(ctx context.Context, script string, keys []string, args ...interface{}) (int64, error) {
	strArgs := make([]string, len(args))
	for i, a := range args {
		strArgs[i] = fmt.Sprintf("%v", a)
	}
	allArgs := append(keys, strArgs...)
	cmdArgs := make([]string, 0, len(allArgs))
	cmdArgs = append(cmdArgs, allArgs...)

	resp := s.Client.Do(ctx, s.Client.B().Arbitrary("EVAL", script, fmt.Sprintf("%d", len(keys))).Args(cmdArgs...).Build())
	return resp.AsInt64()
}

// ScriptLoad loads Lua script, returns SHA
func (s *ValkeyStore) ScriptLoad(ctx context.Context, script string) (string, error) {
	return s.Client.Do(ctx, s.Client.B().ScriptLoad().Script(script).Build()).ToString()
}

// BlocklistAdd adds a JWT ID to the blocklist with TTL
func (s *ValkeyStore) BlocklistAdd(ctx context.Context, jti string, ttl time.Duration) error {
	key := "jwt:blocklist:" + jti
	return s.Set(ctx, key, []byte("1"), ttl)
}

// BlocklistCheck checks if a JWT ID is blocklisted
func (s *ValkeyStore) BlocklistCheck(ctx context.Context, jti string) (bool, error) {
	val, err := s.Get(ctx, "jwt:blocklist:"+jti)
	if err != nil {
		return false, err
	}
	return val != nil, nil
}

// ValkeyMemory is the part of INFO memory that the API exports as metrics.
type ValkeyMemory struct {
	Used int64 // used_memory, bytes
	Max  int64 // maxmemory, bytes; 0 means no limit
}

// MemoryInfo reads used_memory and maxmemory. GoTipe runs Valkey with noeviction,
// so a full instance refuses writes; these values let an alert fire before that.
func (s *ValkeyStore) MemoryInfo(ctx context.Context) (ValkeyMemory, error) {
	text, err := s.Client.Do(ctx, s.Client.B().Info().Section("memory").Build()).ToString()
	if err != nil {
		return ValkeyMemory{}, err
	}
	return parseMemoryInfo(text)
}

// parseMemoryInfo reads "name:value" lines of an INFO reply; a RESP3 verbatim
// reply keeps its "txt:" prefix on the first line, which holds no field we read.
func parseMemoryInfo(text string) (ValkeyMemory, error) {
	var memory ValkeyMemory
	found := map[string]bool{}
	for _, line := range strings.Split(text, "\n") {
		name, value, ok := strings.Cut(strings.TrimSpace(line), ":")
		if !ok {
			continue
		}
		var target *int64
		switch name {
		case "used_memory":
			target = &memory.Used
		case "maxmemory":
			target = &memory.Max
		default:
			continue
		}
		parsed, err := strconv.ParseInt(value, 10, 64)
		if err != nil || parsed < 0 {
			return ValkeyMemory{}, fmt.Errorf("INFO memory has an invalid %s", name)
		}
		*target, found[name] = parsed, true
	}
	if !found["used_memory"] || !found["maxmemory"] {
		return ValkeyMemory{}, errors.New("INFO memory lacks used_memory or maxmemory")
	}
	return memory, nil
}
