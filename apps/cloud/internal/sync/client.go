package sync

import (
	"log/slog"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 1 << 20 // 1MB
)

// Client represents a single WebSocket connection
type Client struct {
	room   *Room
	conn   *websocket.Conn
	send   chan []byte
	peerID string
	userID string
	mu     sync.Mutex
	log    *slog.Logger
}

func NewClient(room *Room, conn *websocket.Conn, peerID, userID string, log *slog.Logger) *Client {
	return &Client{
		room:   room,
		conn:   conn,
		send:   make(chan []byte, 256),
		peerID: peerID,
		userID: userID,
		log:    log,
	}
}

// ReadPump reads messages from the WebSocket connection
func (c *Client) ReadPump() {
	defer func() {
		c.room.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		messageType, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				c.log.Warn("websocket read error", "peer_id", c.peerID, "error", err)
			}
			break
		}

		// Only handle binary messages (CRDT protocol)
		if messageType != websocket.BinaryMessage {
			continue
		}

		if len(message) == 0 {
			continue
		}

		// Parse message type from first byte
		msgType := message[0]
		c.handleMessage(msgType, message)
	}
}

// WritePump writes messages to the WebSocket connection
func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.BinaryMessage, message); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// handleMessage processes binary CRDT protocol messages
func (c *Client) handleMessage(msgType byte, data []byte) {
	switch msgType {
	case 0x01: // SyncStep1 — client sends state vector
		c.room.handleSyncStep1(c, data[1:])
	case 0x02: // SyncStep2 — client sends update in response to server's state vector
		c.room.handleSyncStep2(c, data[1:])
	case 0x03: // Update — incremental CRDT update
		c.room.handleUpdate(c, data[1:])
	case 0x04: // Awareness — cursor/selection state
		c.room.handleAwareness(c, data[1:])
	case 0x05: // AwarenessQuery — request awareness state
		c.room.handleAwarenessQuery(c)
	default:
		c.log.Debug("unknown message type", "type", msgType, "peer_id", c.peerID)
	}
}
