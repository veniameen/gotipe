package sync

import (
	"bytes"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"unicode/utf16"
)

// Presence limits match @gotipe/collaboration. Lengths count UTF-16 code units,
// as JavaScript does, so a name valid in the browser is valid here.
const (
	maxAwarenessBytes  = 32 * 1024
	maxAwarenessName   = 256
	maxAwarenessAvatar = 16 * 1024
	maxPeerIDBytes     = 256
	maxExactInteger    = int64(9007199254740991)
)

var (
	awarenessColor  = regexp.MustCompile(`^#[0-9A-Fa-f]{3}(?:[0-9A-Fa-f]{3})?$`)
	awarenessAvatar = regexp.MustCompile(`^(?i:https?:|data:image/)`)
)

type presenceUser struct {
	Name   *string `json:"name"`
	Color  *string `json:"color"`
	Avatar *string `json:"avatar,omitempty"`
}
type presenceCursor struct {
	BlockID string `json:"blockId"`
	Offset  *int64 `json:"offset"`
}
type presenceSelection struct {
	BlockID string `json:"blockId"`
	From    *int64 `json:"from"`
	To      *int64 `json:"to"`
}

// presenceFields are read from a client. Its own peerId, a removal flag and
// unknown fields are ignored, so they are never relayed.
type presenceFields struct {
	User       *presenceUser      `json:"user"`
	Cursor     *presenceCursor    `json:"cursor,omitempty"`
	Selection  *presenceSelection `json:"selection,omitempty"`
	LastActive *float64           `json:"lastActive"`
}

// presence is the only awareness shape Cloud stores and relays.
type presence struct {
	PeerID string `json:"peerId"`
	presenceFields
}

// readPresence validates one client awareness frame and returns the canonical
// payload to relay for peerID. An error refuses the frame from its sender only.
func readPresence(peerID string, data []byte) ([]byte, error) {
	if len(data) > maxAwarenessBytes {
		return nil, errors.New("awareness payload is larger than 32 KiB")
	}
	var value presenceFields
	decoder := json.NewDecoder(bytes.NewReader(data))
	if err := decoder.Decode(&value); err != nil {
		return nil, errors.New("awareness must be a JSON object")
	}
	if decoder.More() {
		return nil, errors.New("awareness must be one JSON object")
	}
	if err := value.validate(); err != nil {
		return nil, err
	}
	return json.Marshal(presence{PeerID: peerID, presenceFields: value})
}

func (p presenceFields) validate() error {
	user := p.User
	if user == nil || user.Name == nil || utf16Length(*user.Name) > maxAwarenessName {
		return errors.New("awareness user name must be a string of at most 256 characters")
	}
	if user.Color == nil || !awarenessColor.MatchString(*user.Color) {
		return errors.New("awareness user color must be #rgb or #rrggbb")
	}
	if avatar := user.Avatar; avatar != nil && (!awarenessAvatar.MatchString(*avatar) || utf16Length(*avatar) > maxAwarenessAvatar) {
		return errors.New("awareness avatar must be an http(s) or data:image URL of at most 16384 characters")
	}
	if p.LastActive == nil {
		return errors.New("awareness lastActive must be a number")
	}
	if cursor := p.Cursor; cursor != nil && (cursor.BlockID == "" || !exactOffset(cursor.Offset)) {
		return errors.New("awareness cursor needs a block ID and a non-negative integer offset")
	}
	if selection := p.Selection; selection != nil && (selection.BlockID == "" || !exactOffset(selection.From) || !exactOffset(selection.To) || *selection.From > *selection.To) {
		return errors.New("awareness selection needs a block ID and offsets with from <= to")
	}
	return nil
}

func exactOffset(value *int64) bool {
	return value != nil && *value >= 0 && *value <= maxExactInteger
}

func utf16Length(value string) int {
	length := 0
	for _, r := range value {
		length += utf16.RuneLen(r)
	}
	return length
}

// validPeerID applies the replica identity rules of the CRDT: peers with other
// IDs could not have their operations or presence accepted by anyone.
func validPeerID(peerID string) bool {
	return strings.TrimSpace(peerID) != "" && len(peerID) <= maxPeerIDBytes && !strings.HasPrefix(peerID, "@base")
}
