package sync

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/gotipe/cloud/internal/auth"
)

func TestPresenceValidationMatchesTheBrowserProvider(t *testing.T) {
	long := strings.Repeat("Ж", 256)
	for _, tc := range []struct {
		name  string
		frame string
		valid bool
	}{
		{"caret", `{"user":{"name":"Ada","color":"#2c62d4"},"cursor":{"blockId":"p1","offset":5},"lastActive":1762945200000}`, true},
		{"selection and avatar", `{"user":{"name":"","color":"#ABC","avatar":"https://example.test/a.png"},"selection":{"blockId":"p1","from":0,"to":3},"lastActive":1}`, true},
		{"256 Cyrillic characters", `{"user":{"name":"` + long + `","color":"#abc"},"lastActive":1}`, true},
		{"null caret", `{"user":{"name":"Ada","color":"#abc"},"cursor":null,"lastActive":1}`, true},
		{"color name", `{"user":{"name":"Ada","color":"red"},"lastActive":1}`, false},
		{"name too long", `{"user":{"name":"` + long + `Ж","color":"#abc"},"lastActive":1}`, false},
		{"script avatar", `{"user":{"name":"Ada","color":"#abc","avatar":"javascript:alert(1)"},"lastActive":1}`, false},
		{"avatar too long", `{"user":{"name":"Ada","color":"#abc","avatar":"data:image/png;base64,` + strings.Repeat("A", 16*1024) + `"},"lastActive":1}`, false},
		{"missing user", `{"lastActive":1}`, false},
		{"missing lastActive", `{"user":{"name":"Ada","color":"#abc"}}`, false},
		{"negative offset", `{"user":{"name":"Ada","color":"#abc"},"cursor":{"blockId":"p1","offset":-1},"lastActive":1}`, false},
		{"fractional offset", `{"user":{"name":"Ada","color":"#abc"},"cursor":{"blockId":"p1","offset":1.5},"lastActive":1}`, false},
		{"inexact offset", `{"user":{"name":"Ada","color":"#abc"},"cursor":{"blockId":"p1","offset":9007199254740992},"lastActive":1}`, false},
		{"caret without block", `{"user":{"name":"Ada","color":"#abc"},"cursor":{"blockId":"","offset":1},"lastActive":1}`, false},
		{"reversed selection", `{"user":{"name":"Ada","color":"#abc"},"selection":{"blockId":"p1","from":3,"to":1},"lastActive":1}`, false},
		{"array", `[]`, false},
		{"two objects", `{"user":{"name":"Ada","color":"#abc"},"lastActive":1} {}`, false},
		{"not JSON", `{`, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := readPresence("peer", []byte(tc.frame))
			if (err == nil) != tc.valid {
				t.Fatalf("valid=%v, err=%v", tc.valid, err)
			}
		})
	}
	if _, err := readPresence("peer", []byte(`{"user":{"name":"`+strings.Repeat("a", 32*1024)+`","color":"#abc"},"lastActive":1}`)); err == nil {
		t.Fatal("oversized presence accepted")
	}
}

func TestRelayedPresenceCarriesOnlyValidatedFields(t *testing.T) {
	data, err := readPresence("tab-1", []byte(`{"peerId":7,"removed":true,"html":"<img>","user":{"name":"Ada","color":"#abc","role":"admin"},"lastActive":5}`))
	if err != nil {
		t.Fatal(err)
	}
	var relayed map[string]any
	if err := json.Unmarshal(data, &relayed); err != nil {
		t.Fatal(err)
	}
	user := relayed["user"].(map[string]any)
	if relayed["peerId"] != "tab-1" || relayed["removed"] != nil || relayed["html"] != nil || user["role"] != nil || len(relayed) != 3 {
		t.Fatalf("relayed unvalidated fields: %s", data)
	}
}

func TestInvalidPresenceIsRefusedFromItsSenderOnly(t *testing.T) {
	store := &memoryPersistence{}
	room := startRoom(t, store)
	a := join(t, room, "a")
	receive(t, a, 2)
	b := join(t, room, "b")
	receive(t, b, 2)
	valid := `{"user":{"name":"Ada","color":"#abc"},"cursor":{"blockId":"b1","offset":1},"lastActive":1}`
	room.handleAwareness(a, []byte(valid))
	relayed := receive(t, b, 4)
	room.handleAwareness(a, []byte(`{"user":{"name":"Ada","color":"red"},"lastActive":2}`))
	if code := errorCode(t, receive(t, a, 8)); code != "INVALID_AWARENESS" {
		t.Fatalf("sender got %s", code)
	}
	// FIFO: b's next frame answers its own request, so nothing was relayed.
	room.handleSyncStep1(b, nil)
	receive(t, b, 2)
	// The refused frame did not replace a's last valid presence.
	c := join(t, room, "c")
	receive(t, c, 2)
	if stored := receive(t, c, 4); string(stored) != string(relayed) {
		t.Fatalf("stored presence changed: %s", stored)
	}
	// The sender stays connected and can still edit.
	room.handleUpdate(a, updateFor("a", 1, "Ж"))
	receive(t, a, 9)
}

func TestSyncRejectsPeerIdentityTheCRDTCannotUse(t *testing.T) {
	server := NewServer(&memoryPersistence{}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	t.Cleanup(server.Shutdown)
	for _, peer := range []string{strings.Repeat("p", 257), "@base-1", "   "} {
		query := url.Values{"document_id": {"doc"}, "peer_id": {peer}}
		request := httptest.NewRequest(http.MethodGet, "/sync?"+query.Encode(), nil)
		request = request.WithContext(auth.WithUser(request.Context(), &auth.UserContext{UserID: "user"}))
		response := httptest.NewRecorder()
		server.HandleWebSocket()(response, request)
		// The upgrade itself would also answer 400 to this plain request; the
		// body shows the peer rule refused it first.
		if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "peer_id must be") {
			t.Fatalf("peer %q: got %d %s", peer, response.Code, response.Body)
		}
	}
	if server.RoomCount() != 0 {
		t.Fatal("an invalid peer opened a room")
	}
}
