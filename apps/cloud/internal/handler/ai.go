package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	cloudAI "github.com/gotipe/cloud/internal/ai"
	"github.com/gotipe/cloud/internal/apierror"
	"github.com/gotipe/cloud/internal/auth"
	"github.com/gotipe/cloud/internal/billing"
	"github.com/gotipe/cloud/internal/storage"
)

type AIHandler struct {
	db              *storage.PostgresStore
	provider        cloudAI.Provider
	defaultProvider string
	defaultModel    string
	maxTokens       int
}

func NewAIHandler(db *storage.PostgresStore, provider cloudAI.Provider, defaultProvider, defaultModel string, maxTokens int) *AIHandler {
	return &AIHandler{db: db, provider: provider, defaultProvider: defaultProvider, defaultModel: defaultModel, maxTokens: maxTokens}
}

type AIRequest struct {
	DocumentID  string          `json:"document_id,omitempty"`
	Model       string          `json:"model,omitempty"`
	Provider    string          `json:"provider,omitempty"`
	Command     string          `json:"command"`
	Context     json.RawMessage `json:"context"`
	Prompt      string          `json:"prompt,omitempty"`
	MaxTokens   int             `json:"max_tokens,omitempty"`
	Temperature *float64        `json:"temperature,omitempty"`
	Stream      bool            `json:"stream"`
}

func (h *AIHandler) Complete() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			apierror.ErrUnauthorized.Write(w)
			return
		}
		var req AIRequest
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
			apierror.ErrInvalidJSON.Write(w)
			return
		}
		commands := map[string]bool{"complete": true, "rewrite": true, "summarize": true, "translate": true, "fix_grammar": true, "change_tone": true}
		if !commands[req.Command] || (strings.TrimSpace(req.Prompt) == "" && (len(req.Context) == 0 || string(req.Context) == "null")) {
			apierror.ErrValidation.WithMessage("A supported command and prompt or context are required").Write(w)
			return
		}
		if req.DocumentID != "" && !requireDocumentAccess(w, r, h.db.Pool, req.DocumentID, "viewer") {
			return
		}
		if req.Provider == "" {
			req.Provider = h.defaultProvider
		}
		if req.Model == "" {
			if req.Provider != h.defaultProvider {
				apierror.ErrValidation.WithMessage("model is required for a different provider").Write(w)
				return
			}
			req.Model = h.defaultModel
		}
		if req.MaxTokens == 0 {
			req.MaxTokens = h.maxTokens
		}
		if req.MaxTokens < 1 || req.MaxTokens > h.maxTokens || req.Model == "" || (req.Temperature != nil && (*req.Temperature < 0 || *req.Temperature > 2)) {
			apierror.ErrValidation.WithMessage("Invalid model, max_tokens or temperature").Write(w)
			return
		}
		if h.provider == nil {
			apierror.ErrServiceDown.WithMessage("AI provider is not configured").Write(w)
			return
		}
		reservation, err := h.reserveAI(r.Context(), user)
		if errors.Is(err, billing.ErrQuotaExceeded) {
			apierror.ErrQuotaExceeded.WithMessage("AI request limit reached for your plan").Write(w)
			return
		}
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}
		defer h.releaseAI(r.Context(), user.UserID, reservation)

		started := false
		emit := func(text string) error {
			if !started {
				if _, ok := w.(http.Flusher); !ok {
					return errors.New("streaming is not supported")
				}
				w.Header().Set("Content-Type", "text/event-stream")
				w.Header().Set("Cache-Control", "no-cache")
				w.Header().Set("X-Accel-Buffering", "no")
				started = true
				if err := writeAIEvent(w, "start", map[string]string{"model": req.Model, "provider": req.Provider}); err != nil {
					return err
				}
			}
			return writeAIEvent(w, "content", map[string]string{"text": text})
		}
		result, err := h.provider.Complete(r.Context(), cloudAI.Request{Provider: req.Provider, Model: req.Model, Command: req.Command, Context: req.Context, Prompt: req.Prompt, MaxTokens: req.MaxTokens, Temperature: req.Temperature, Stream: req.Stream}, emit)
		if err != nil {
			if started {
				_ = writeAIEvent(w, "error", map[string]string{"code": "AI_PROVIDER_ERROR", "message": "AI generation failed"})
			} else {
				apierror.ErrServiceDown.WithMessage("AI provider is unavailable or returned an error").Write(w)
			}
			return
		}
		tag, err := h.db.Pool.Exec(r.Context(), `UPDATE usage_logs SET action='ai.request',resource_id=$3 WHERE user_id=$1 AND resource_id=$2 AND action='ai.pending'`, user.UserID, reservation, req.Provider+"/"+req.Model)
		if err != nil || tag.RowsAffected() != 1 {
			if started {
				_ = writeAIEvent(w, "error", map[string]string{"code": "USAGE_RECORD_FAILED", "message": "Could not record AI usage"})
			} else {
				apierror.ErrInternal.Write(w)
			}
			return
		}
		if req.Stream {
			if !started {
				if err := emit(result.Content); err != nil {
					return
				}
			}
			_ = writeAIEvent(w, "done", map[string]any{"usage": result.Usage})
		} else {
			apierror.WriteJSON(w, http.StatusOK, result)
		}
	}
}
func writeAIEvent(w http.ResponseWriter, event string, payload any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	if _, err = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, data); err != nil {
		return err
	}
	if flusher, ok := w.(http.Flusher); ok {
		flusher.Flush()
	}
	return nil
}
