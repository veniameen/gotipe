package sync

import (
	"context"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/gotipe/cloud/internal/auth"
	"github.com/gotipe/cloud/internal/handler"
)

var upgrader = websocket.Upgrader{
	Subprotocols:    []string{"gotipe.v1"},
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
}

// Server manages WebSocket sync rooms
type Server struct {
	authorize      AuthorizationCheck
	allowedOrigins map[string]bool
	messageLimit   int
	messageWindow  time.Duration
	rooms          map[string]*Room
	persist        PersistenceStore
	log            *slog.Logger
	mu             sync.RWMutex
	ctx            context.Context
	cancel         context.CancelFunc
}

func NewServer(persist PersistenceStore, log *slog.Logger) *Server {
	ctx, cancel := context.WithCancel(context.Background())
	return &Server{
		messageLimit: 1000, messageWindow: time.Minute,
		rooms:   make(map[string]*Room),
		persist: persist,
		log:     log,
		ctx:     ctx,
		cancel:  cancel,
	}
}

// HandleWebSocket handles WebSocket upgrade for /sync/{documentId}
func (s *Server) HandleWebSocket() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		documentID := r.URL.Query().Get("document_id")
		if documentID == "" {
			http.Error(w, "document_id required", http.StatusBadRequest)
			return
		}

		peerID := r.URL.Query().Get("peer_id")
		if peerID == "" {
			http.Error(w, "peer_id required", http.StatusBadRequest)
			return
		}
		if !validPeerID(peerID) {
			http.Error(w, "peer_id must be at most 256 bytes and not start with @base", http.StatusBadRequest)
			return
		}

		connectionUpgrader := upgrader
		connectionUpgrader.CheckOrigin = s.checkOrigin
		conn, err := connectionUpgrader.Upgrade(w, r, nil)
		if err != nil {
			s.log.Error("websocket upgrade failed", "error", err)
			return
		}

		room := s.getOrCreateRoom(roomKey(documentID))
		client := NewClient(room, conn, peerID, user.UserID, s.log)
		s.mu.RLock()
		client.limiter = newMessageWindow(s.messageLimit, s.messageWindow)
		client.expiresAt = user.ExpiresAt
		if check := s.authorize; check != nil {
			client.authorize = func(ctx context.Context) error { return check(ctx, user, documentID) }
		}
		s.mu.RUnlock()

		select {
		case room.register <- client:
		case <-room.Done():
			conn.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseInternalServerErr, "Document collaboration state is unavailable"), time.Now().Add(time.Second))
			conn.Close()
			return
		case <-r.Context().Done():
			conn.Close()
			return
		}

		handler.WebSocketConnections.Inc()
		defer handler.WebSocketConnections.Dec()

		// Start read/write pumps
		go client.WritePump()
		client.ReadPump() // blocks until connection closes
	}
}

func (s *Server) getOrCreateRoom(documentID string) *Room {
	s.mu.RLock()
	room, exists := s.rooms[documentID]
	s.mu.RUnlock()

	if exists {
		select {
		case <-room.Done():
		default:
			return room
		}
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// Double-check after acquiring write lock
	if room, exists := s.rooms[documentID]; exists {
		select {
		case <-room.Done():
		default:
			return room
		}
	}

	room = NewRoom(documentID, s.persist, s.log)
	s.rooms[documentID] = room

	handler.WebSocketRooms.Inc()

	go func() {
		room.Run(s.ctx)
		s.mu.Lock()
		if s.rooms[documentID] == room {
			delete(s.rooms, documentID)
		}
		s.mu.Unlock()
		handler.WebSocketRooms.Dec()
	}()

	return room
}

// RoomCount returns number of active rooms
func (s *Server) RoomCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.rooms)
}

// Shutdown gracefully stops all rooms
func (s *Server) Shutdown() {
	s.cancel()
	s.log.Info("sync server shutdown", "rooms", s.RoomCount())
}
