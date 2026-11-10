package ai

import (
	"errors"
	"net/url"
	"strings"
)

func (p *HTTPProvider) request(input Request, key string) (string, map[string]any, map[string]string, error) {
	instructions := map[string]string{
		"complete": "Continue the supplied text.", "rewrite": "Rewrite the supplied text following the user's instruction.",
		"summarize": "Summarize the supplied text.", "translate": "Translate the supplied text into the requested language.",
		"fix_grammar": "Correct grammar and spelling while preserving meaning.", "change_tone": "Change the tone as requested while preserving meaning.",
	}
	instruction, ok := instructions[input.Command]
	if !ok {
		return "", nil, nil, errors.New("unsupported AI command")
	}
	prompt := instruction + "\nReturn only the resulting text.\n\nUser instruction:\n" + input.Prompt + "\n\nDocument context:\n" + string(input.Context)
	messages := []map[string]string{{"role": "user", "content": prompt}}
	endpoint := p.endpoints[input.Provider]
	body := map[string]any{"model": input.Model, "messages": messages, "stream": input.Stream}
	headers := map[string]string{}
	switch input.Provider {
	case "openai":
		headers["Authorization"] = "Bearer " + key
		body["max_completion_tokens"] = input.MaxTokens
		if input.Stream {
			body["stream_options"] = map[string]bool{"include_usage": true}
		}
	case "anthropic":
		headers["x-api-key"] = key
		headers["anthropic-version"] = "2023-06-01"
		body["max_tokens"] = input.MaxTokens
	case "google":
		headers["x-goog-api-key"] = key
		action := "generateContent"
		if input.Stream {
			action = "streamGenerateContent?alt=sse"
		}
		endpoint += url.PathEscape(strings.TrimPrefix(input.Model, "models/")) + ":" + action
		generation := map[string]any{"maxOutputTokens": input.MaxTokens}
		if input.Temperature != nil {
			generation["temperature"] = *input.Temperature
		}
		body = map[string]any{"contents": []any{map[string]any{"role": "user", "parts": []any{map[string]string{"text": prompt}}}}, "generationConfig": generation}
	default:
		return "", nil, nil, ErrNotConfigured
	}
	if input.Temperature != nil && input.Provider != "google" {
		body["temperature"] = *input.Temperature
	}
	return endpoint, body, headers, nil
}
