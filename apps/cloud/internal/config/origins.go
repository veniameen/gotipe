package config

import (
	"fmt"
	"net/url"
	"os"
	"strings"
)

func httpOrigins(environment string) []string {
	if value, exists := os.LookupEnv("HTTP_ALLOWED_ORIGINS"); exists {
		return splitValues(value)
	}
	if environment == "production" {
		return []string{"https://gotipe.com", "https://app.gotipe.com", "https://docs.gotipe.com"}
	}
	return []string{"http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5173", "http://127.0.0.1:5173"}
}
func validateOrigins(name string, origins []string) error {
	for _, origin := range origins {
		parsed, err := url.Parse(origin)
		if err != nil || parsed.Hostname() == "" || (parsed.Scheme != "https" && parsed.Scheme != "http") || parsed.User != nil || parsed.Path != "" || parsed.RawQuery != "" || parsed.ForceQuery || parsed.Fragment != "" || strings.ContainsAny(origin, "*# \t\r\n") {
			return fmt.Errorf("%s must contain exact http(s) origins without credentials, paths or wildcards", name)
		}
	}
	return nil
}
