package sync

import (
	"net/http"

	"github.com/gorilla/websocket"
)

// offersDeltas reports whether the upgrade will select gotipe.v2.
func offersDeltas(r *http.Request) bool {
	for _, protocol := range websocket.Subprotocols(r) {
		if protocol == deltaSubprotocol {
			return true
		}
	}
	return false
}

// validGeneration accepts the shape of a generation token: short and safe in a
// URL. Whether it names the document's current baseline is the room's decision.
func validGeneration(generation string) bool {
	if generation == "" || len(generation) > 128 {
		return false
	}
	for _, c := range []byte(generation) {
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9', c == '.', c == '_', c == '~', c == '-':
		default:
			return false
		}
	}
	return true
}
