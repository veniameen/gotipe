package middleware

import (
	"github.com/gorilla/websocket"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestLoggerPreservesWebSocketHijacking(t *testing.T) {
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	server := httptest.NewServer(LoggerMiddleware(log, ClientAddresses{})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upgrader := websocket.Upgrader{}
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Error(err)
			return
		}
		defer conn.Close()
		if err = conn.WriteMessage(websocket.TextMessage, []byte("upgraded")); err != nil {
			t.Error(err)
		}
	})))
	defer server.Close()
	conn, _, err := websocket.DefaultDialer.Dial(strings.Replace(server.URL, "http://", "ws://", 1), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	_, message, err := conn.ReadMessage()
	if err != nil || string(message) != "upgraded" {
		t.Fatalf("message=%s err=%v", message, err)
	}
}
func TestLoggerPreservesStreamingFlush(t *testing.T) {
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	h := LoggerMiddleware(log, ClientAddresses{})(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("streaming interface lost")
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Write([]byte("data: chunk\n\n"))
		flusher.Flush()
	}))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("POST", "/v1/ai/complete", nil))
	if !w.Flushed {
		t.Fatal("SSE remained buffered")
	}
}
