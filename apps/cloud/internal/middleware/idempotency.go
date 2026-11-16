package middleware

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"sort"
	"time"

	"github.com/gotipe/cloud/internal/apierror"
	"github.com/gotipe/cloud/internal/auth"
)

type IdempotencyStore interface {
	Get(context.Context, string) ([]byte, error)
	Set(context.Context, string, []byte, time.Duration) error
	Eval(context.Context, string, []string, ...interface{}) (int64, error)
}
type cachedResponse struct {
	Fingerprint string      `json:"fingerprint"`
	Status      int         `json:"status"`
	Headers     http.Header `json:"headers,omitempty"`
	Body        []byte      `json:"body,omitempty"`
	// Omitted marks a completed request whose reply was not kept: it exceeded
	// MaxReplayBody, or it carried a secret (Secret) that must not rest in Valkey.
	Omitted bool `json:"omitted,omitempty"`
	Secret  bool `json:"secret,omitempty"`
}

// MaxReplayBody bounds the reply one idempotency record keeps in Valkey for 24
// hours. Valkey runs with noeviction because revocations and idempotency claims
// must not be dropped, so what each record stores has to stay small.
const MaxReplayBody = 256 << 10

const claimIdempotency = `if redis.call('SET',KEYS[1],ARGV[1],'NX','EX',86400) then return 1 else return 0 end`

// releaseIdempotency drops a claim only while it is still the pending record of
// the request that made it.
const releaseIdempotency = `if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end`

type outcomeKey struct{}

// replayOutcome is how the layers below IdempotencyMiddleware describe the reply
// they wrote. The handler chain runs in the request goroutine, so it needs no lock.
type replayOutcome struct{ notRun, secret bool }

func outcomeOf(r *http.Request) *replayOutcome {
	outcome, _ := r.Context().Value(outcomeKey{}).(*replayOutcome)
	return outcome
}

// MarkNotRun says that the request was refused before it ran and changed nothing,
// such as a rate limit refusal or an unavailable AI provider. Such a reply is not
// the request's result: IdempotencyMiddleware releases the key, so a retry with the
// same key runs. Outside IdempotencyMiddleware it does nothing.
func MarkNotRun(r *http.Request) {
	if outcome := outcomeOf(r); outcome != nil {
		outcome.notRun = true
	}
}

// MarkSecretReply says that the reply carries a secret shown once, such as a new API
// key. IdempotencyMiddleware then records only the status: the secret never rests in
// Valkey, and a repeat answers 409 instead of showing it again.
func MarkSecretReply(r *http.Request) {
	if outcome := outcomeOf(r); outcome != nil {
		outcome.secret = true
	}
}

type ReplayAuthorizer func(http.ResponseWriter, *http.Request, []byte, []byte) bool

// IdempotencyMiddleware claims a key before invoking the mutation. An uncertain
// write remains claimed, so retries cannot repeat an operation after storage or
// process failure. Identical completed requests replay their original response; a
// refusal marked with MarkNotRun releases the key instead. A 5xx reply is never
// recorded: it is not a completed result, so unless it is marked with MarkNotRun
// the claim stays uncertain. maxBody is the request body limit of the router: a
// body the API accepts is accepted with a key too.
func IdempotencyMiddleware(store IdempotencyStore, maxBody int64, authorize ...ReplayAuthorizer) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key := r.Header.Get("Idempotency-Key")
			if key == "" || r.Method == "GET" || r.Method == "HEAD" || r.Method == "OPTIONS" {
				next.ServeHTTP(w, r)
				return
			}
			if len(key) > 255 {
				apierror.ErrValidation.WithMessage("Idempotency-Key exceeds 255 bytes").Write(w)
				return
			}
			user := auth.UserFromContext(r.Context())
			if user == nil {
				apierror.ErrUnauthorized.Write(w)
				return
			}
			body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBody))
			var tooLarge *http.MaxBytesError
			if errors.As(err, &tooLarge) {
				errBodyTooLarge.Write(w)
				return
			}
			if err != nil {
				apierror.ErrValidation.WithMessage("Request body cannot be read").Write(w)
				return
			}
			r.Body = io.NopCloser(bytes.NewReader(body))
			// Streaming responses cannot be replayed as one atomic HTTP result.
			if r.URL.Path == "/v1/ai/complete" {
				var options struct {
					Stream bool `json:"stream"`
				}
				if json.Unmarshal(body, &options) == nil && options.Stream {
					apierror.ErrValidation.WithMessage("Idempotency-Key is supported for non-streaming AI requests").Write(w)
					return
				}
			}
			hash := sha256.New()
			hash.Write([]byte(r.Method + "\n" + r.URL.RequestURI() + "\n" + r.Header.Get("Content-Type") + "\n"))
			hash.Write(body)
			scopes := append([]string(nil), user.Scopes...)
			documents := append([]string(nil), user.DocumentIDs...)
			sort.Strings(scopes)
			sort.Strings(documents)
			authority, _ := json.Marshal(struct {
				Scopes, Documents []string
				Org               string
			}{scopes, documents, user.OrgID})
			hash.Write(authority)
			fingerprint := hex.EncodeToString(hash.Sum(nil))
			keyHash := sha256.Sum256([]byte(key))
			cacheKey := "idempotency:" + user.UserID + ":" + hex.EncodeToString(keyHash[:])
			pending, _ := json.Marshal(cachedResponse{Fingerprint: fingerprint})
			claimed, err := store.Eval(r.Context(), claimIdempotency, []string{cacheKey}, string(pending))
			if err != nil {
				apierror.ErrServiceDown.Write(w)
				return
			}
			if claimed != 1 {
				cached, err := store.Get(r.Context(), cacheKey)
				if err != nil {
					apierror.ErrServiceDown.Write(w)
					return
				}
				var response cachedResponse
				if len(cached) == 0 || json.Unmarshal(cached, &response) != nil {
					apierror.ErrServiceDown.Write(w)
					return
				}
				if response.Fingerprint != fingerprint {
					apierror.ErrConflict.WithMessage("Idempotency-Key was already used for a different request").Write(w)
					return
				}
				if response.Status == 0 {
					apierror.ErrConflict.WithMessage("The original request is pending or its result is uncertain; do not repeat the mutation with a new key").Write(w)
					return
				}
				if response.Secret {
					apierror.ErrConflict.WithMessage(fmt.Sprintf("The original request completed with status %d; its response held a secret that is shown only once and is not kept for replay, so read the resource instead of repeating the mutation", response.Status)).Write(w)
					return
				}
				if response.Omitted {
					apierror.ErrConflict.WithMessage(fmt.Sprintf("The original request completed with status %d; its response was too large to keep for replay, so read the resource instead of repeating the mutation", response.Status)).Write(w)
					return
				}
				if response.Status >= 200 && response.Status < 300 && len(response.Body) > 0 {
					for _, check := range authorize {
						if !check(w, r, body, response.Body) {
							return
						}
					}
				}
				writeCached(w, response)
				return
			}
			recorder := httptest.NewRecorder()
			outcome := &replayOutcome{}
			next.ServeHTTP(recorder, r.WithContext(context.WithValue(r.Context(), outcomeKey{}, outcome)))
			response := cachedResponse{Fingerprint: fingerprint, Status: recorder.Code, Headers: recorder.Header().Clone(), Body: recorder.Body.Bytes()}
			if outcome.notRun {
				// A detached context: a client that hung up must not leave the key claimed.
				release, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 5*time.Second)
				defer cancel()
				if _, err := store.Eval(release, releaseIdempotency, []string{cacheKey}, string(pending)); err != nil {
					apierror.ErrServiceDown.WithMessage("The request did not run, but its Idempotency-Key could not be released; retry with a new key").Write(w)
					return
				}
				writeCached(w, response)
				return
			}
			if response.Status >= 500 {
				// A server error may have stopped the request half-way. Neither replay
				// it nor run the request again: the claim stays pending, and a repeat
				// answers 409 until the claim expires.
				writeCached(w, response)
				return
			}
			record := response
			if outcome.secret || len(record.Body) > MaxReplayBody {
				// The caller still gets the full reply now; the record keeps only the outcome.
				record = cachedResponse{Fingerprint: fingerprint, Status: response.Status, Omitted: true, Secret: outcome.secret}
			}
			data, err := json.Marshal(record)
			if err != nil {
				apierror.ErrServiceDown.Write(w)
				return
			}
			if err = store.Set(r.Context(), cacheKey, data, 24*time.Hour); err != nil {
				apierror.ErrServiceDown.WithMessage("Request outcome could not be recorded; retain the same Idempotency-Key").Write(w)
				return
			}
			writeCached(w, response)
		})
	}
}
func writeCached(w http.ResponseWriter, response cachedResponse) {
	for key, values := range response.Headers {
		w.Header()[key] = append([]string(nil), values...)
	}
	w.WriteHeader(response.Status)
	_, _ = w.Write(response.Body)
}
