package sync

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestMessageWindowBoundsBurstAndExpiresOldEntries(t *testing.T) {
	window := newMessageWindow(3, time.Second)
	now := time.Now()
	for i := 0; i < 3; i++ {
		if !window.allow(now.Add(time.Duration(i) * 100 * time.Millisecond)) {
			t.Fatal("allowed burst rejected")
		}
	}
	if window.allow(now.Add(999 * time.Millisecond)) {
		t.Fatal("burst exceeded limit")
	}
	if !window.allow(now.Add(time.Second)) || window.allow(now.Add(time.Second)) {
		t.Fatal("wrong sliding expiration")
	}
	if !window.allow(now.Add(1100 * time.Millisecond)) {
		t.Fatal("second message never expired")
	}
	if len(window.times) != 3 {
		t.Fatal("unbounded message history")
	}
}

func TestReadPumpClosesExcessMessagesWithPolicyCode(t *testing.T) {
	room := &Room{unregister: make(chan *Client, 1), done: make(chan struct{})}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		client := NewClient(room, conn, "peer", "user", slog.New(slog.NewTextHandler(io.Discard, nil)))
		client.limiter = newMessageWindow(2, time.Minute)
		client.ReadPump()
	}))
	defer server.Close()
	conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http"), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	for i := 0; i < 3; i++ {
		if err := conn.WriteMessage(websocket.TextMessage, []byte("ignored text")); err != nil {
			t.Fatal(err)
		}
	}
	conn.SetReadDeadline(time.Now().Add(time.Second))
	_, _, err = conn.ReadMessage()
	if !websocket.IsCloseError(err, websocket.ClosePolicyViolation) {
		t.Fatalf("rate limit did not close with policy code: %v", err)
	}
}
