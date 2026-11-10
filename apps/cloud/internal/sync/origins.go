package sync

import (
	"errors"
	"net/http"
	"net/url"
	"strings"
)

// SetAllowedOrigins configures explicit browser origins in addition to same-origin
// requests. Wildcards, opaque/null origins, credentials and URL paths are rejected.
func (s *Server) SetAllowedOrigins(origins []string) error {
	allowed := make(map[string]bool, len(origins))
	for _, origin := range origins {
		canonical, err := parseOrigin(origin)
		if err != nil {
			return err
		}
		allowed[canonical] = true
	}
	s.mu.Lock()
	s.allowedOrigins = allowed
	s.mu.Unlock()
	return nil
}
func parseOrigin(origin string) (string, error) {
	parsed, err := url.Parse(origin)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" || parsed.User != nil || parsed.Path != "" || parsed.RawQuery != "" || parsed.ForceQuery || parsed.Fragment != "" || parsed.Opaque != "" || strings.ContainsAny(origin, "#* \t\r\n") {
		return "", errors.New("sync origin must be an exact http(s) scheme and host without path, query, or credentials")
	}
	return strings.ToLower(parsed.Scheme) + "://" + strings.ToLower(parsed.Host), nil
}
func (s *Server) checkOrigin(r *http.Request) bool {
	origins := r.Header.Values("Origin")
	if len(origins) == 0 {
		return true
	}
	if len(origins) != 1 {
		return false
	}
	origin, err := parseOrigin(origins[0])
	if err != nil {
		return false
	}
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	if origin == scheme+"://"+strings.ToLower(r.Host) {
		return true
	}
	s.mu.RLock()
	allowed := s.allowedOrigins[origin]
	s.mu.RUnlock()
	return allowed
}
