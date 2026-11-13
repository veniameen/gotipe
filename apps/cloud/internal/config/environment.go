package config

import (
	"fmt"
	"net/netip"
	"strconv"
	"time"
)

// environment reads typed values and keeps the first invalid one. An invalid value
// stops the API at startup instead of falling back to a default silently.
type environment struct {
	lookup func(string) (string, bool)
	err    error
}

func (e *environment) fail(format string, args ...any) {
	if e.err == nil {
		e.err = fmt.Errorf(format, args...)
	}
}

// text returns the value, or fallback when the variable is unset or empty.
func (e *environment) text(name, fallback string) string {
	if value, ok := e.lookup(name); ok && value != "" {
		return value
	}
	return fallback
}

func (e *environment) list(name string) []string {
	return splitValues(e.text(name, ""))
}

func (e *environment) integer(name string, fallback int) int {
	value := e.text(name, "")
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseInt(value, 10, 32)
	if err != nil {
		e.fail("%s must be an integer", name)
		return fallback
	}
	return int(parsed)
}

// duration accepts Go durations only ("90s", "1h"). A bare number is rejected
// rather than guessed as seconds.
func (e *environment) duration(name string, fallback time.Duration) time.Duration {
	value := e.text(name, "")
	if value == "" {
		return fallback
	}
	parsed, err := time.ParseDuration(value)
	if err != nil || parsed <= 0 {
		e.fail("%s must be a positive duration such as 30s or 1h", name)
		return fallback
	}
	return parsed
}

func (e *environment) boolean(name string, fallback bool) bool {
	value := e.text(name, "")
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		e.fail("%s must be a boolean", name)
		return fallback
	}
	return parsed
}

func (e *environment) prefixes(name string) []netip.Prefix {
	prefixes, err := parseTrustedProxies(e.list(name))
	if err != nil {
		e.fail("%s: %v", name, err)
		return nil
	}
	return prefixes
}
