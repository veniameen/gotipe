package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/gotipe/cloud/internal/storage"
)

type APIKeyService struct {
	pool storage.Database
}

func NewAPIKeyService(pool storage.Database) *APIKeyService {
	return &APIKeyService{pool: pool}
}

// ValidateKey checks API key against DB. Format: gt_live_sk_<32hex> or gt_test_sk_<32hex>
func (s *APIKeyService) ValidateKey(ctx context.Context, key string) (*UserContext, error) {
	if !strings.HasPrefix(key, "gt_") {
		return nil, fmt.Errorf("invalid api key format")
	}

	hash := sha256.Sum256([]byte(key))
	keyHash := hex.EncodeToString(hash[:])

	var userID, plan string
	var scopes []string
	err := s.pool.QueryRow(ctx,
		`SELECT u.id, u.plan, k.scopes
		 FROM api_keys k JOIN users u ON k.user_id = u.id
		 WHERE k.key_hash = $1 AND (k.expires_at IS NULL OR k.expires_at > now())`,
		keyHash,
	).Scan(&userID, &plan, &scopes)

	if err != nil {
		return nil, fmt.Errorf("invalid api key")
	}

	// Update last_used_at (fire and forget)
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_, _ = s.pool.Exec(ctx,
			`UPDATE api_keys SET last_used_at = now() WHERE key_hash = $1`, keyHash)
	}()

	return &UserContext{
		UserID:     userID,
		Plan:       plan,
		Scopes:     scopes,
		APIKeyHash: keyHash,
	}, nil
}

// CurrentPlan also confirms that a JWT's account still exists. Entitlements must
// reflect billing changes instead of remaining frozen until the JWT expires.
func (s *APIKeyService) CurrentPlan(ctx context.Context, userID string) (string, error) {
	var plan string
	err := s.pool.QueryRow(ctx, `SELECT plan FROM users WHERE id=$1`, userID).Scan(&plan)
	return plan, err
}

// GenerateKey creates new API key, returns raw key (only shown once) and prefix
func GenerateKey(env string) (rawKey, prefix string) {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	hexStr := hex.EncodeToString(b)

	if env == "production" {
		prefix = "gt_live_sk_"
	} else {
		prefix = "gt_test_sk_"
	}
	rawKey = prefix + hexStr
	return rawKey, prefix[:8]
}

// HashKey returns SHA-256 hex hash of API key
func HashKey(key string) string {
	hash := sha256.Sum256([]byte(key))
	return hex.EncodeToString(hash[:])
}
