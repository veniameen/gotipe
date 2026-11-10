// Package ai adapts hosted text-generation APIs without exposing server credentials.
package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

var ErrNotConfigured = errors.New("AI provider is not configured")

type Request struct {
	Provider    string
	Model       string
	Command     string
	Context     json.RawMessage
	Prompt      string
	MaxTokens   int
	Temperature *float64
	Stream      bool
}
type Usage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
}
type Result struct {
	Content  string `json:"content"`
	Model    string `json:"model"`
	Provider string `json:"provider"`
	Usage    Usage  `json:"usage"`
}
type Provider interface {
	Complete(context.Context, Request, func(string) error) (Result, error)
}

type HTTPProvider struct {
	client    *http.Client
	keys      map[string]string
	endpoints map[string]string
}

func NewHTTPProvider(openAIKey, anthropicKey, googleKey string) *HTTPProvider {
	return &HTTPProvider{client: &http.Client{Timeout: 2 * time.Minute}, keys: map[string]string{"openai": openAIKey, "anthropic": anthropicKey, "google": googleKey}, endpoints: map[string]string{"openai": "https://api.openai.com/v1/chat/completions", "anthropic": "https://api.anthropic.com/v1/messages", "google": "https://generativelanguage.googleapis.com/v1beta/models/"}}
}
func (p *HTTPProvider) Complete(ctx context.Context, input Request, emit func(string) error) (Result, error) {
	result := Result{Provider: input.Provider, Model: input.Model}
	key := p.keys[input.Provider]
	if key == "" {
		return result, ErrNotConfigured
	}
	endpoint, body, headers, err := p.request(input, key)
	if err != nil {
		return result, err
	}
	encoded, err := json.Marshal(body)
	if err != nil {
		return result, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(encoded))
	if err != nil {
		return result, err
	}
	req.Header.Set("Content-Type", "application/json")
	for name, value := range headers {
		req.Header.Set(name, value)
	}
	response, err := p.client.Do(req)
	if err != nil {
		return result, fmt.Errorf("AI request failed: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return result, fmt.Errorf("AI provider returned HTTP %d", response.StatusCode)
	}
	if input.Stream {
		return readStream(response.Body, input, result, emit)
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, 4<<20))
	if err != nil {
		return result, err
	}
	text, usage, _, err := decodeResponse(input.Provider, data, false)
	if err != nil {
		return result, err
	}
	if text == "" {
		return result, errors.New("AI provider returned no text")
	}
	result.Content = text
	result.Usage = usage
	return result, nil
}
