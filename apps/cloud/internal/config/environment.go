package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

func validateEnvironmentValues() error {
	for _, name := range []string{"DATABASE_MAX_CONNS", "DATABASE_IDLE_CONNS", "VALKEY_MAX_CONNS", "AI_MAX_TOKENS", "EXPORT_WORKERS", "EXPORT_MAX_DOCUMENT_SIZE"} {
		if value := os.Getenv(name); value != "" {
			if _, err := strconv.ParseInt(value, 10, 32); err != nil {
				return fmt.Errorf("%s must be an integer", name)
			}
		}
	}
	for _, name := range []string{"JWT_EXPIRY", "AI_CACHE_TTL", "EXPORT_POLL_INTERVAL"} {
		if value := os.Getenv(name); value != "" {
			parsed, err := time.ParseDuration(value)
			if err != nil || parsed <= 0 {
				return fmt.Errorf("%s must be a positive duration", name)
			}
		}
	}
	for _, name := range []string{"S3_USE_PATH_STYLE", "PROMETHEUS_ENABLED"} {
		if value := os.Getenv(name); value != "" {
			if _, err := strconv.ParseBool(value); err != nil {
				return fmt.Errorf("%s must be a boolean", name)
			}
		}
	}
	return nil
}
