package ai

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestProviderContracts(t *testing.T) {
	for _, tc := range []struct{ name, header, path, response string }{
		{"openai", "Authorization", "/", `{"choices":[{"message":{"content":"Привет 😀"}}],"usage":{"prompt_tokens":5,"completion_tokens":3}}`},
		{"anthropic", "x-api-key", "/", `{"content":[{"type":"text","text":"Привет 😀"}],"usage":{"input_tokens":5,"output_tokens":3}}`},
		{"google", "x-goog-api-key", "/model:generateContent", `{"candidates":[{"content":{"parts":[{"text":"hidden","thought":true},{"text":"Привет 😀"}]}}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":3}}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != "POST" || r.URL.Path != tc.path || r.Header.Get(tc.header) == "" {
					t.Errorf("invalid upstream request: %s %s", r.Method, r.URL.Path)
				}
				var body map[string]any
				if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
					t.Fatal(err)
				}
				if tc.name == "openai" && body["max_completion_tokens"] != float64(100) {
					t.Errorf("token limit missing: %v", body)
				}
				if tc.name == "google" && body["generationConfig"].(map[string]any)["maxOutputTokens"] != float64(100) {
					t.Errorf("token limit missing")
				}
				io.WriteString(w, tc.response)
			}))
			defer server.Close()
			provider := NewHTTPProvider("test-key", "test-key", "test-key")
			provider.endpoints[tc.name] = server.URL + "/"
			result, err := provider.Complete(context.Background(), Request{Provider: tc.name, Model: "model", Command: "rewrite", Prompt: "friendly", MaxTokens: 100}, nil)
			if err != nil || result.Content != "Привет 😀" || result.Usage != (Usage{5, 3}) {
				t.Fatalf("bad result: %+v %v", result, err)
			}
		})
	}
}

func TestStreamingAccumulatesTextAndUsage(t *testing.T) {
	for _, tc := range []struct{ provider, body string }{
		{"openai", "data: {\"choices\":[{\"delta\":{\"content\":\"Привет \"}}]}\n\ndata: {\"choices\":[{\"delta\":{\"content\":\"😀\"}}],\"usage\":{\"prompt_tokens\":4,\"completion_tokens\":2}}\n\ndata: [DONE]\n\n"},
		{"anthropic", "data: {\"type\":\"message_start\",\"message\":{\"usage\":{\"input_tokens\":4}}}\n\ndata: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"Привет 😀\"}}\n\ndata: {\"type\":\"message_delta\",\"usage\":{\"output_tokens\":2}}\n\ndata: {\"type\":\"message_stop\"}\n\n"},
		{"google", "data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"Привет 😀\"}]},\"finishReason\":\"STOP\"}],\"usageMetadata\":{\"promptTokenCount\":4,\"candidatesTokenCount\":2}}\n\n"},
	} {
		t.Run(tc.provider, func(t *testing.T) {
			var emitted strings.Builder
			result, err := readStream(strings.NewReader(tc.body), Request{Provider: tc.provider}, Result{}, func(text string) error { emitted.WriteString(text); return nil })
			if err != nil || result.Content != "Привет 😀" || emitted.String() != result.Content || result.Usage != (Usage{4, 2}) {
				t.Fatalf("bad stream: %+v %v", result, err)
			}
		})
	}
}

func TestStreamingFailuresAreNotCompleted(t *testing.T) {
	for _, body := range []string{`data: {"choices":[{"delta":{"content":"partial"}}]}` + "\n\n", `data: {"error":{"message":"upstream secret"}}` + "\n\n", "data: invalid\n\n"} {
		if _, err := readStream(strings.NewReader(body), Request{Provider: "openai"}, Result{}, nil); err == nil {
			t.Fatal("incomplete/error stream was accepted")
		}
	}
	canceled := errors.New("consumer canceled")
	_, err := readStream(strings.NewReader("data: {\"choices\":[{\"delta\":{\"content\":\"text\"}}]}\n\n"), Request{Provider: "openai"}, Result{}, func(string) error { return canceled })
	if !errors.Is(err, canceled) {
		t.Fatalf("consumer error lost: %v", err)
	}
}

func TestProviderErrorsDoNotLeakResponseBodies(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(401)
		io.WriteString(w, "sensitive upstream body")
	}))
	defer server.Close()
	p := NewHTTPProvider("test-key", "", "")
	p.endpoints["openai"] = server.URL
	_, err := p.Complete(context.Background(), Request{Provider: "openai", Command: "complete"}, nil)
	if err == nil || strings.Contains(err.Error(), "sensitive") {
		t.Fatalf("bad error %v", err)
	}
	_, err = p.Complete(context.Background(), Request{Provider: "anthropic"}, nil)
	if !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("unconfigured provider returned %v", err)
	}
}
