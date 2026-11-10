package sync

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func sessionSocket(t *testing.T, expires time.Time, check func(context.Context) error) (*Client, *websocket.Conn) {
	t.Helper()
	clients := make(chan *Client, 1)
	room := &Room{unregister: make(chan *Client, 1), done: make(chan struct{}), events: make(chan roomEvent, 1)}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		client := NewClient(room, conn, "peer", "user", slog.New(slog.NewTextHandler(io.Discard, nil)))
		client.expiresAt = expires
		client.authorize = check
		clients <- client
		go client.WritePump()
		client.ReadPump()
	}))
	t.Cleanup(server.Close)
	conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http"), nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	return <-clients, conn
}

func TestIdleConnectionClosesAtCredentialExpiration(t *testing.T) {
	_, conn := sessionSocket(t, time.Now().Add(100*time.Millisecond), nil)
	conn.SetReadDeadline(time.Now().Add(time.Second))
	_, _, err := conn.ReadMessage()
	if !websocket.IsCloseError(err, websocket.ClosePolicyViolation) {
		t.Fatalf("expired connection remains active: %v", err)
	}
}
func TestRevokedConnectionCannotReceiveAnotherDocumentUpdate(t *testing.T) {
	var denied atomic.Bool
	client, conn := sessionSocket(t, time.Time{}, func(context.Context) error {
		if denied.Load() {
			return errors.New("revoked")
		}
		return nil
	})
	client.send <- []byte{0x02, 1}
	conn.SetReadDeadline(time.Now().Add(time.Second))
	if _, _, err := conn.ReadMessage(); err != nil {
		t.Fatal(err)
	}
	denied.Store(true)
	client.send <- []byte{0x03, 2}
	_, _, err := conn.ReadMessage()
	if !websocket.IsCloseError(err, websocket.ClosePolicyViolation) {
		t.Fatalf("revoked client received data: %v", err)
	}
}
func TestRevokedConnectionCannotEnqueueAnotherUpdate(t *testing.T) {
	client, conn := sessionSocket(t, time.Time{}, func(context.Context) error { return errors.New("revoked") })
	if err := conn.WriteMessage(websocket.BinaryMessage, []byte{0x03, 1}); err != nil {
		t.Fatal(err)
	}
	conn.SetReadDeadline(time.Now().Add(time.Second))
	_, _, err := conn.ReadMessage()
	if !websocket.IsCloseError(err, websocket.ClosePolicyViolation) || len(client.room.events) != 0 {
		t.Fatalf("unauthorized update queued: %v", err)
	}
}
