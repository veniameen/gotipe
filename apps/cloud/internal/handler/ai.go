package handler

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/gotipe/cloud/internal/apierror"
	"github.com/gotipe/cloud/internal/auth"
	"github.com/gotipe/cloud/internal/billing"
	"github.com/gotipe/cloud/internal/storage"
)

type AIHandler struct {
	db             *storage.PostgresStore
	valkey         *storage.ValkeyStore
	defaultProvider string
	defaultModel   string
	maxTokens      int
}

func NewAIHandler(db *storage.PostgresStore, valkey *storage.ValkeyStore, defaultProvider, defaultModel string, maxTokens int) *AIHandler {
	return &AIHandler{
		db:             db,
		valkey:         valkey,
		defaultProvider: defaultProvider,
		defaultModel:   defaultModel,
		maxTokens:      maxTokens,
	}
}

type AIRequest struct {
	Model       string          `json:"model,omitempty"`
	Provider    string          `json:"provider,omitempty"`
	Command     string          `json:"command"` // "complete", "rewrite", "summarize", "translate", "fix_grammar", "change_tone"
	Context     json.RawMessage `json:"context"`
	Prompt      string          `json:"prompt,omitempty"`
	MaxTokens   int             `json:"max_tokens,omitempty"`
	Temperature float64         `json:"temperature,omitempty"`
	Stream      bool            `json:"stream"`
}

// Complete handles POST /v1/ai/complete — AI proxy with SSE streaming
func (h *AIHandler) Complete() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			apierror.ErrUnauthorized.Write(w)
			return
		}

		var req AIRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			apierror.ErrInvalidJSON.Write(w)
			return
		}

		// Check AI quota
		var aiCount int64
		_ = h.db.Pool.QueryRow(r.Context(),
			`SELECT COUNT(*) FROM usage_logs WHERE user_id = $1
			 AND action = 'ai.request' AND created_at > date_trunc('month', now())`,
			user.UserID,
		).Scan(&aiCount)

		if !billing.CheckAIQuota(user.Plan, aiCount) {
			apierror.ErrQuotaExceeded.WithMessage("AI request limit reached for your plan").Write(w)
			return
		}

		provider := req.Provider
		if provider == "" {
			provider = h.defaultProvider
		}
		model := req.Model
		if model == "" {
			model = h.defaultModel
		}
		maxTokens := req.MaxTokens
		if maxTokens <= 0 {
			maxTokens = h.maxTokens
		}

		// Log AI usage
		_, _ = h.db.Pool.Exec(r.Context(),
			`INSERT INTO usage_logs (user_id, action, resource_type, resource_id, created_at)
			 VALUES ($1, 'ai.request', 'ai', $2, now())`,
			user.UserID, provider+"/"+model,
		)

		if req.Stream {
			// SSE streaming response
			w.Header().Set("Content-Type", "text/event-stream")
			w.Header().Set("Cache-Control", "no-cache")
			w.Header().Set("Connection", "keep-alive")
			w.Header().Set("X-Accel-Buffering", "no")

			flusher, ok := w.(http.Flusher)
			if !ok {
				apierror.ErrInternal.WithMessage("Streaming not supported").Write(w)
				return
			}

			// Send start event
			fmt.Fprintf(w, "event: start\ndata: {\"model\":\"%s\",\"provider\":\"%s\"}\n\n", model, provider)
			flusher.Flush()

			// In production, this would proxy to the actual AI provider
			// For now, send a placeholder response indicating the proxy endpoint is ready
			fmt.Fprintf(w, "event: content\ndata: {\"text\":\"AI proxy ready for %s/%s\"}\n\n", provider, model)
			flusher.Flush()

			fmt.Fprintf(w, "event: done\ndata: {\"usage\":{\"prompt_tokens\":0,\"completion_tokens\":0}}\n\n")
			flusher.Flush()
		} else {
			// Non-streaming response
			apierror.WriteJSON(w, http.StatusOK, map[string]interface{}{
				"model":    model,
				"provider": provider,
				"content":  fmt.Sprintf("AI proxy ready for %s/%s", provider, model),
				"usage": map[string]int{
					"prompt_tokens":     0,
					"completion_tokens": 0,
				},
			})
		}
	}
}
