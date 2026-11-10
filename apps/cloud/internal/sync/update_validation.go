package sync

import (
	"bytes"
	"encoding/json"
	"errors"
	"strings"
	"unicode/utf8"
)

type positionPart struct {
	Digit uint32      `json:"digit"`
	ID    operationID `json:"id"`
}
type position []positionPart
type replicaMark struct {
	Type  string                     `json:"mark_type"`
	Attrs map[string]json.RawMessage `json:"attrs"`
}
type changeFields struct {
	Collection string          `json:"collection,omitempty"`
	BlockID    string          `json:"block_id,omitempty"`
	Parent     *string         `json:"parent,omitempty"`
	Position   position        `json:"position,omitempty"`
	BlockType  string          `json:"block_type,omitempty"`
	Kind       string          `json:"kind,omitempty"`
	Key        string          `json:"key,omitempty"`
	Value      json.RawMessage `json:"value,omitempty"`
	Marks      []replicaMark   `json:"marks,omitempty"`
	Target     json.RawMessage `json:"target,omitempty"`
	MarkType   string          `json:"mark_type,omitempty"`
	Mark       *replicaMark    `json:"mark,omitempty"`
	Source     string          `json:"source,omitempty"`
	From       *position       `json:"from,omitempty"`
	To         *position       `json:"to,omitempty"`
	Prefix     position        `json:"prefix,omitempty"`
	Active     *bool           `json:"active,omitempty"`
}

const maxLamport = uint64(9007199254740991)

func validIdentity(id operationID) bool {
	return id.Lamport > 0 && id.Lamport <= maxLamport && strings.TrimSpace(id.PeerID) != "" && len(id.PeerID) <= 256 && !strings.HasPrefix(id.PeerID, "@base")
}
func validPosition(pos position) bool {
	if len(pos) == 0 || len(pos) > 1024 {
		return false
	}
	for _, part := range pos {
		if len(part.ID.PeerID) > 512 || part.ID.Lamport > maxLamport {
			return false
		}
	}
	return true
}
func validAttr(value json.RawMessage) bool {
	var data any
	if json.Unmarshal(value, &data) != nil {
		return false
	}
	return validJSONAttr(data, 0)
}
func validJSONAttr(data any, depth int) bool {
	if depth > 64 {
		return false
	}
	switch value := data.(type) {
	case nil, string, float64, bool:
		return true
	case []any:
		for _, child := range value {
			if !validJSONAttr(child, depth+1) {
				return false
			}
		}
		return true
	case map[string]any:
		for _, child := range value {
			if !validJSONAttr(child, depth+1) {
				return false
			}
		}
		return true
	default:
		return false
	}
}
func validMark(mark replicaMark) bool {
	if mark.Type == "" || mark.Attrs == nil {
		return false
	}
	for _, value := range mark.Attrs {
		if !validAttr(value) {
			return false
		}
	}
	return true
}
func validateOperation(op replicaOperation) error {
	if !validIdentity(op.ID) {
		return errors.New("invalid operation identity")
	}
	var tagged map[string]json.RawMessage
	if json.Unmarshal(op.Change, &tagged) != nil || len(tagged) != 1 {
		return errors.New("invalid replicated change")
	}
	for kind, raw := range tagged {
		var fields changeFields
		decoder := json.NewDecoder(bytes.NewReader(raw))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&fields); err != nil {
			return err
		}
		valid := false
		switch kind {
		case "SetData":
			var value *string
			valid = (fields.Collection == "comments" || fields.Collection == "suggestions") && fields.Key != "" && json.Unmarshal(fields.Value, &value) == nil

		case "CreateBlock":
			valid = fields.BlockID != "" && fields.BlockType != "" && validPosition(fields.Position) && validKind(fields.Kind)
		case "DeleteBlock":
			valid = fields.BlockID != ""
		case "MoveBlock":
			valid = fields.BlockID != "" && validPosition(fields.Position)
		case "SetType":
			valid = fields.BlockID != "" && fields.BlockType != "" && validKind(fields.Kind)
		case "SetAttr":
			valid = fields.BlockID != "" && fields.Key != "" && validAttr(fields.Value)
		case "InsertChar":
			var value string
			valid = fields.BlockID != "" && validPosition(fields.Position) && json.Unmarshal(fields.Value, &value) == nil && utf8.RuneCountInString(value) == 1 && utf8.ValidString(value) && fields.Marks != nil
			for _, mark := range fields.Marks {
				valid = valid && validMark(mark)
			}
		case "DeleteChar", "SetMark", "SetOperationActive":
			var target operationID
			valid = json.Unmarshal(fields.Target, &target) == nil && target.Lamport > 0 && target.Lamport <= maxLamport && strings.TrimSpace(target.PeerID) != "" && len(target.PeerID) <= 512
			if kind == "SetOperationActive" {
				valid = valid && fields.Active != nil
			} else {
				valid = valid && fields.BlockID != ""
			}
			if kind == "SetMark" {
				valid = valid && fields.MarkType != "" && (fields.Mark == nil || validMark(*fields.Mark))
			}
		case "MoveTextRange":
			var target string
			valid = fields.Source != "" && json.Unmarshal(fields.Target, &target) == nil && target != "" && target != fields.Source && validPosition(fields.Prefix)
			if fields.From != nil {
				valid = valid && validPosition(*fields.From)
			}
			if fields.To != nil {
				valid = valid && validPosition(*fields.To)
			}
		}
		if !valid {
			return errors.New("invalid or unsupported replicated change: " + kind)
		}
	}
	return nil
}
func validKind(kind string) bool { return kind == "RichText" || kind == "Raw" || kind == "Empty" }
